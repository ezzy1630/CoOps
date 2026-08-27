import type { Content, GoogleGenAI as GoogleGenAIType, Tool, Type as GenAIType } from '@google/genai'
import type { AgentBlueprint, Receipt, WorldEvent } from '../../../src/types.js'
import { deptById, personById } from '../../../src/data/company.js'
import type { GuardrailAdapter } from '../guardrail/types.js'
import type { DeptMemory } from '../memory/types.js'
import { createDryRunTools, WORKSPACE_TOOLS } from '../tools/dryrun.js'
import { LAUNCH_TOOLS } from '../tools/launch.js'
import type { WorkspaceToolAdapter } from '../tools/types.js'
import { runExchange } from './exchanges.js'
import type { ExchangeExecutor } from './exchanges.js'
import type { BrainAdapter, BrainCtx } from './types.js'
import { DEFAULT_GEMINI_MODEL } from '../config.js'

const REFUSAL = 'That request was blocked by policy. Rephrase it or contact your department lead.'

const EXCHANGE_KINDS = ['budget', 'legal', 'faq'] as const

const Type = {
  OBJECT: 'OBJECT' as unknown as GenAIType,
  STRING: 'STRING' as unknown as GenAIType,
  ARRAY: 'ARRAY' as unknown as GenAIType,
}

const TOOLS: Tool[] = [{
  functionDeclarations: [
    {
      name: 'reply_to_human',
      description: 'Send your answer to the human in this department chat.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: 'The message to send.' },
        },
        required: ['text'],
      },
    },
    {
      name: 'dispatch_exchange',
      description: 'Dispatch a typed cross-department task to a peer department agent: budget asks Finance, legal asks Legal, faq asks Support.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, description: 'Which peer request to send.', enum: [...EXCHANGE_KINDS] },
        },
        required: ['kind'],
      },
    },
    {
      name: 'propose_blueprint',
      description: 'Draft a dedicated agent blueprint; the human reviews and approves it under Work & Approvals.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Short agent name.' },
          purpose: { type: Type.STRING, description: 'The finish line this agent owns, not a to-do list.' },
          trigger: { type: Type.STRING, description: 'What starts its work: schedule, event, or a person asking.' },
          skills: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Skills it needs.' },
          toolIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Tool ids like gdrive, gsheets, zendesk.' },
          collaborators: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Peer agents to pull in.' },
          approvals: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Human sign-offs required before acting.' },
          limits: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Hard limits written into the blueprint.' },
        },
        required: ['name', 'purpose'],
      },
    },
    {
      name: 'workspace_write',
      description:
        'Perform one audited side-effect. Workspace tools (gdrive, gsheets, zendesk, shopify, slack) record a write. '
        + 'Launch tools run the publication pipeline in order: localfile finds an asset under the allow-listed root, '
        + 'gcs stages it in Cloud Storage, youtube publishes it — youtube only succeeds after a named human approved '
        + 'that exact checksum. Every call returns an inspectable receipt.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          tool: { type: Type.STRING, description: 'Which tool to use.', enum: [...WORKSPACE_TOOLS, ...LAUNCH_TOOLS] },
          action: {
            type: Type.STRING,
            description:
              'For workspace tools, the write action. For localfile, the filename search terms. '
              + 'For gcs, the destination object name. For youtube, the video description.',
          },
          detail: { type: Type.STRING, description: 'One-line summary of exactly what the call changes.' },
        },
        required: ['tool', 'action', 'detail'],
      },
    },
    {
      name: 'request_publication_approval',
      description:
        'Ask a named human to approve publishing the staged asset. Required before youtube can publish: the approval '
        + 'is bound to the staged file checksum, so it cannot be reused for a different file.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'The exact title you propose to publish under.' },
          privacy: { type: Type.STRING, description: 'Proposed privacy setting.', enum: ['public', 'unlisted', 'private'] },
          approver: { type: Type.STRING, description: 'Person id who holds this right; defaults to the department lead.' },
        },
        required: ['title', 'privacy'],
      },
    },
  ],
}]

const asString = (v: unknown): string => (typeof v === 'string' ? v : '')
const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

export function createGeminiBrain(opts: {
  apiKey: string
  model?: string
  guardrail: GuardrailAdapter
  memory: DeptMemory
  workspaceTools?: WorkspaceToolAdapter
}): BrainAdapter {
  const workspaceTools = opts.workspaceTools ?? createDryRunTools()
  let aiPromise: Promise<GoogleGenAIType> | null = null

  const getAi = (): Promise<GoogleGenAIType> => {
    if (!aiPromise) {
      aiPromise = (async () => {
        const { GoogleGenAI } = await import('@google/genai')
        return new GoogleGenAI({ apiKey: opts.apiKey })
      })().catch(err => {
        aiPromise = null
        throw err
      })
    }
    return aiPromise
  }

  const model = opts.model ?? process.env.COOPS_GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL

  const geminiExecutor: ExchangeExecutor = async (spec) => {
    const ai = await getAi()
    const workerRole = `${spec.workerId} owning “${spec.title}”`
    const systemInstruction =
      `You are the ${workerRole} completing a delegated cross-department task. ` +
      'Produce the deliverable summary asked for. Concise, factual, no roleplay, no preamble.'
    const res = await ai.models.generateContent({
      model,
      contents: [
        `Task objective: ${spec.objective}`,
        `Requested deliverable: ${spec.artifact.name} (${spec.artifact.type}).`,
        `Requesting department: ${deptById.get(spec.fromDept)?.name ?? spec.fromDept}.`,
      ].join('\n'),
      config: { systemInstruction },
    })
    const text = res.text ?? ''
    if ((await opts.guardrail.inspect(text)).blocked) throw new Error('exchange output blocked by guardrail')
    return { summary: text, source: 'Gemini model output' }
  }

  return {
    async handle(ctx, agentId, deptId, text, personId) {
      try {
        const ai = await getAi()
        await runTurn(ctx, ai, model, opts.guardrail, opts.memory, workspaceTools, geminiExecutor, agentId, deptId, text, personId)
      } catch (err) {
        console.error(`[gemini-brain] turn failed for agent ${agentId} in ${deptId}:`, err)
        const reply = publicGeminiError(err)
        ctx.emit({
          type: 'Chat', from: { kind: 'agent', id: agentId }, to: { kind: 'person', id: personId },
          title: reply, payload: { text: reply },
        })
      }
    },
    async continuePublication(ctx, request, approval) {
      const authority = approval.payload?.receipt
      const proposal = request.payload?.receipt
      const agentId = request.from?.kind === 'agent' ? request.from.id : null
      const approver = approval.from?.kind === 'person' ? approval.from : null
      const deptId = request.deptFrom ?? request.deptTo
      if (
        request.type !== 'PermissionRequest'
        || request.blockedOn?.kind !== 'approval'
        || proposal?.kind !== 'authority'
        || authority?.kind !== 'authority'
        || !authority.live
        || !authority.ok
        || proposal.fields.checksum !== authority.fields.checksum
        || !agentId
        || !approver
        || !deptId
      ) return

      const startedAt = performance.now()
      // The adapter reads the approved authority back from the event log. The
      // event passed here identifies the continuation; it is not an alternate
      // source of publication authority.
      const result = await workspaceTools.call(
        'youtube',
        `Approved publication of ${authority.fields.title ?? proposal.fields.title ?? 'the staged asset'}.`,
      )
      const latencyMs = Math.round(performance.now() - startedAt)
      const publication = result.receipt?.kind === 'publication' ? result.receipt : null
      const videoId = publication?.fields.videoId?.trim()
      const published = result.ok && publication?.live === true && publication.ok && Boolean(videoId)

      ctx.emit({
        type: 'ToolCall',
        taskId: request.taskId,
        from: { kind: 'agent', id: agentId },
        deptFrom: deptId,
        title: published
          ? `youtube: published ${authority.fields.title ?? proposal.fields.title ?? 'approved asset'}`
          : 'youtube: approved publication not completed',
        detail: result.detail,
        payload: {
          tool: 'youtube',
          action: `continue after approval ${approval.id}`,
          latencyMs,
          ...(publication ? { receipt: publication } : {}),
        },
      })
      const resultText = published
        ? `Published "${authority.fields.title ?? proposal.fields.title ?? 'the approved asset'}" to YouTube as ${videoId}. The live receipt is in the proof package.`
        : `Publication did not reach YouTube. ${result.detail}`
      ctx.schedule([{
        at: 300,
        e: {
          type: 'Chat',
          from: { kind: 'agent', id: agentId },
          to: approver,
          deptFrom: deptId,
          deptTo: request.deptTo ?? request.deptFrom,
          taskId: request.taskId,
          title: resultText,
          payload: { text: resultText },
        },
      }])
    },
  }
}

/** Keep provider diagnostics in server logs; the UI gets an actionable category only. */
export function publicGeminiError(error: unknown): string {
  const message = String((error as Error | undefined)?.message ?? error)
  const detail = /SERVICE_DISABLED|has not been used in project/i.test(message)
    ? 'The Gemini API is not enabled for this backend project.'
    : /PERMISSION_DENIED|403/.test(message)
      ? 'The backend is not authorized to call the configured Gemini model.'
      : 'The configured Gemini model did not return a response.'
  return `${detail} Check the backend logs, correct the provider configuration, and retry.`
}

async function runTurn(
  ctx: BrainCtx,
  ai: GoogleGenAIType,
  model: string,
  guardrail: GuardrailAdapter,
  memory: DeptMemory,
  workspaceTools: WorkspaceToolAdapter,
  geminiExecutor: ExchangeExecutor,
  agentId: string,
  deptId: string,
  text: string,
  personId: string,
): Promise<void> {
  const incoming = await guardrail.inspect(text)
  if (incoming.blocked) {
    emitBlocked(ctx, deptId, guardrail, incoming.category)
    finishWithRefusal(ctx, agentId, personId)
    return
  }

  await memory.append(deptId, 'human', text)
  const recent = await memory.read(deptId, 12)

  const dept = deptById.get(deptId)
  const deptName = dept?.name ?? deptId
  const systemInstruction = [
    `You are the ${deptName} Agent of Everpeak Outfitters, an outdoor-gear company.`,
    dept ? `${deptName} covers ${dept.blurb}.` : '',
    'You are a plain-label operator: concise, practical, no roleplay.',
    'Coordinate peer departments by dispatching typed tasks with dispatch_exchange.',
    'When a recurring job deserves its own dedicated agent, draft it with propose_blueprint; the human approves blueprints under Work & Approvals.',
    'Record side-effectful writes to connected tools (Google Drive, Sheets, Zendesk, Shopify, Slack) with workspace_write; writes are audited, and external systems are touched only when a connection is configured.',
    'Never ask for passwords, API keys, secrets, card numbers, or government IDs.',
    'Always answer by calling reply_to_human; plain text is treated as a reply too.',
  ].filter(Boolean).join('\n')

  const contents: Content[] = [{
    role: 'user',
    parts: [{
      text: [
        `Recent ${deptName} transcript (oldest first; the last line is the current message):`,
        ...recent.map((m) => `${m.role}: ${m.text}`),
        '',
        'Handle the latest message now.',
      ].join('\n'),
    }],
  }]

  let replied = false
  // taskId of an exchange dispatched during this turn, so a guardrail block on
  // the reply can abort the whole request instead of leaving it running forever
  let turnTaskId: string | null = null

  const say = async (raw: string): Promise<boolean> => {
    const verdict = await guardrail.inspect(raw)
    if (verdict.blocked) {
      emitBlocked(ctx, deptId, guardrail, verdict.category)
      if (turnTaskId) {
        ctx.cancelTask(turnTaskId)
        emitExchangeAborted(ctx, turnTaskId, deptId, verdict.category)
      }
      finishWithRefusal(ctx, agentId, personId)
      return true
    }
    await memory.append(deptId, 'agent', raw)
    ctx.schedule([{
      at: 1100,
      e: {
        type: 'Chat', from: { kind: 'agent', id: agentId }, to: { kind: 'person', id: personId },
        title: raw, payload: { text: raw },
      },
    }])
    return true
  }

  for (let i = 0; i < 3 && !replied; i++) {
    const res = await ai.models.generateContent({
      model,
      contents,
      config: { systemInstruction, tools: TOOLS },
    })

    const calls = res.functionCalls ?? []
    const call = calls[0]
    if (!call || !call.name) {
      replied = await say(res.text ?? '')
      break
    }
    const args = call.args ?? {}

    if (call.name === 'reply_to_human') {
      const out = asString(args.text)
      contents.push({ role: 'model', parts: [{ functionCall: call }] })
      contents.push(functionResponse(call.name, out ? 'sent' : 'error: empty text'))
      if (out) replied = await say(out)
      continue
    }

    if (call.name === 'dispatch_exchange') {
      const kind = asString(args.kind) as (typeof EXCHANGE_KINDS)[number]
      if (!EXCHANGE_KINDS.includes(kind)) {
        contents.push({ role: 'model', parts: [{ functionCall: call }] })
        contents.push(functionResponse(call.name, 'error: kind must be budget, legal, or faq'))
        continue
      }
      const { dispatched, taskId } = runExchange(ctx, geminiExecutor, kind, deptId)
      if (taskId) turnTaskId = taskId
      contents.push({ role: 'model', parts: [{ functionCall: call }] })
      contents.push(functionResponse(call.name, dispatched ? 'exchange dispatched' : 'handled locally'))
      replied = await say(dispatched
        ? `On it. I’m dispatching the ${kind} request to the peer department now. Watch the map for the task edge.`
        : 'That sits inside our own department, so I’m handling it locally.')
      continue
    }

    if (call.name === 'propose_blueprint') {
      const blueprint: AgentBlueprint = {
        name: asString(args.name) || `${deptName} Custom Agent`,
        deptId,
        purpose: asString(args.purpose),
        trigger: asString(args.trigger) || 'A person asking in this department',
        skills: asStrings(args.skills),
        toolIds: asStrings(args.toolIds),
        collaborators: asStrings(args.collaborators),
        approvals: asStrings(args.approvals),
        limits: asStrings(args.limits),
        ownerId: personId,
      }
      ctx.emit({
        type: 'BlueprintProposed',
        from: { kind: 'agent', id: agentId },
        to: { kind: 'person', id: personId },
        deptFrom: deptId,
        title: `Blueprint ready: ${blueprint.name}`,
        detail: 'Review the proposed config and approve when ready.',
        payload: { blueprint },
      })
      contents.push({ role: 'model', parts: [{ functionCall: call }] })
      contents.push(functionResponse(call.name, 'blueprint proposed'))
      replied = await say(`I drafted a blueprint for “${blueprint.name}”. Open Work & Approvals to review and approve it.`)
      continue
    }

    if (call.name === 'workspace_write') {
      const tool = asString(args.tool).trim().toLowerCase()
      const action = asString(args.action).trim()
      const startedAt = performance.now()
      const result = await workspaceTools.call(tool, action)
      const latencyMs = Math.round(performance.now() - startedAt)
      contents.push({ role: 'model', parts: [{ functionCall: call }] })
      if (!result.ok) {
        contents.push(functionResponse(call.name, `error: ${result.detail}`))
        continue
      }
      ctx.emit({
        type: 'ToolCall',
        from: { kind: 'agent', id: agentId },
        deptFrom: deptId,
        taskId: undefined,
        title: `${tool}: ${action}`,
        detail: result.detail,
        // latency is measured; cost is omitted because no billing data exists
        payload: { tool, action, latencyMs, ...(result.receipt ? { receipt: result.receipt } : {}) },
      })
      contents.push(functionResponse(call.name, result.detail))
      replied = await say(
        result.receipt?.live
          ? `${result.detail} The receipt is in the run's proof package.`
          : `Recorded ${tool}.${action} without touching an external system. ${result.detail}`,
      )
      continue
    }

    if (call.name === 'request_publication_approval') {
      contents.push({ role: 'model', parts: [{ functionCall: call }] })
      const asset = workspaceTools.staged?.() ?? null
      if (!asset) {
        contents.push(functionResponse(call.name, 'error: no asset staged — run localfile first'))
        continue
      }
      const title = asString(args.title).trim() || asset.filename
      const privacy = asString(args.privacy).trim() || 'private'
      const approver = approverFor(asString(args.approver).trim(), deptId)
      if (!approver) {
        contents.push(functionResponse(call.name, 'error: no approver holds this right in this department'))
        continue
      }
      const channel = `CoOps · ${deptName} · Work & Approvals`
      const proposal: Receipt = {
        kind: 'authority',
        claim: 'A named human was asked to approve this exact asset, title and privacy setting.',
        live: true,
        ok: false,
        at: new Date().toISOString(),
        fields: {
          approver: personById.get(approver)?.name ?? approver,
          channel,
          title,
          privacy,
          checksum: `sha256:${asset.sha256}`,
        },
      }
      ctx.emit({
        type: 'PermissionRequest',
        from: { kind: 'agent', id: agentId },
        to: { kind: 'person', id: approver },
        deptFrom: deptId,
        deptTo: deptId,
        title: `Publish “${title}” to YouTube (${privacy})`,
        detail: `${asset.filename} · sha256 ${asset.sha256.slice(0, 12)} · awaiting ${personById.get(approver)?.name ?? approver}`,
        blockedOn: { what: `Publish “${title}” to YouTube`, personId: approver, kind: 'approval' },
        payload: { receipt: proposal },
      })
      contents.push(functionResponse(call.name, `approval requested from ${approver}`))
      replied = await say(
        `I asked ${personById.get(approver)?.name ?? approver} to approve publishing “${title}” as ${privacy}. `
        + `The request carries the file's checksum, so approving it authorises this file and no other.`,
      )
      continue
    }

    contents.push({ role: 'model', parts: [{ functionCall: call }] })
    contents.push(functionResponse(call.name, 'error: unknown tool'))
  }

  if (!replied) await say('Done for now. Tell me if you want anything else.')
}

/** Publication authority belongs to a person in the department; the lead holds it by default. */
function approverFor(requested: string, deptId: string): string | null {
  if (requested && personById.get(requested)?.deptId === deptId) return requested
  return deptById.get(deptId)?.leadId ?? null
}

function emitBlocked(ctx: BrainCtx, deptId: string, guardrail: GuardrailAdapter, category?: string): void {
  const reason = category ?? 'unclassified'
  const e: Omit<WorldEvent, 'id' | 'ts'> = {
    type: 'GuardrailBlock',
    from: { kind: 'system', id: 'gateway' },
    deptFrom: deptId,
    title: `${guardrail.name} blocked content`,
    detail: `category: ${reason}`,
    payload: { reason },
  }
  ctx.emit(e)
}

/** A guardrail block after an exchange was dispatched aborts the request:
 * the task is closed as failed so it cannot hang open forever. */
function emitExchangeAborted(ctx: BrainCtx, taskId: string, deptId: string, category?: string): void {
  ctx.emit({
    type: 'TaskFailed',
    taskId,
    from: { kind: 'system', id: 'gateway' },
    deptFrom: deptId,
    title: 'Cross-department request aborted by policy',
    detail: `The exchange was blocked before work started (category: ${category ?? 'unclassified'}).`,
    payload: { reason: category ?? 'guardrail_block' },
  })
}

function finishWithRefusal(ctx: BrainCtx, agentId: string, personId: string): void {
  ctx.schedule([{
    at: 1100,
    e: {
      type: 'Chat', from: { kind: 'agent', id: agentId }, to: { kind: 'person', id: personId },
      title: REFUSAL, payload: { text: REFUSAL },
    },
  }])
}

function functionResponse(name: string, result: unknown): Content {
  return {
    role: 'user',
    parts: [{ functionResponse: { name, response: { result } } }],
  }
}
