import type { Express } from 'express'
import { Router } from 'express'
import { agentCardHandler, jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express'
import { DefaultRequestHandler, InMemoryTaskStore } from '@a2a-js/sdk/server'
import type { AgentExecutor } from '@a2a-js/sdk/server'
import { Role } from '@a2a-js/sdk'
import type { Message, Part } from '@a2a-js/sdk'
import type { WorldEvent } from '../../../src/types.js'
import type { EventStore } from '../store.js'
import type { Bus } from '../bus.js'
import type { OrgRegistry } from '../org.js'
import { newId } from '../ids.js'
import { agentCardFor, operatorDefFor } from './cards.js'
import type { OperatorDef } from './cards.js'

const PEER_ID = 'a2a-peer'
const REPLY_TIMEOUT_MS = 6000
const FALLBACK_REPLY = 'Request committed to the CoOps event log.'

interface A2aDeps {
  store: EventStore
  bus: Bus<WorldEvent>
}

export function mountA2a(app: Express, deps: A2aDeps, org: OrgRegistry): void {
  const deptRouters = new Map<string, Router>()

  app.use('/a2a', (req, res, next) => {
    const dept = req.path.split('/')[1]
    const entry = dept ? org.get(dept) : undefined
    if (!dept || !entry) return void next()
    let router = deptRouters.get(dept)
    if (!router) {
      router = buildDeptRouter(operatorDefFor(entry), deps)
      deptRouters.set(dept, router)
    }
    router(req, res, next)
  })
}

function buildDeptRouter(op: OperatorDef, deps: A2aDeps): Router {
  const requestHandler = new DefaultRequestHandler(
    agentCardFor(op),
    new InMemoryTaskStore(),
    createExecutor(op, deps),
  )
  const router = Router()
  router.use(`/${op.dept}/.well-known/agent-card.json`, agentCardHandler({ agentCardProvider: requestHandler }))
  router.use(`/${op.dept}`, jsonRpcHandler({
    requestHandler,
    userBuilder: UserBuilder.noAuthentication,
    legacyCompat: { enabled: true },
  }))
  return router
}

function createExecutor(op: OperatorDef, deps: A2aDeps): AgentExecutor {
  return {
    execute: async (requestContext, eventBus) => {
      const text = firstTextPart(requestContext.userMessage.parts)
      const reply = await askOperator(deps.store, deps.bus, op.id, text)
      const message: Message = {
        messageId: newId('a2amsg'),
        contextId: requestContext.contextId,
        taskId: requestContext.taskId,
        role: Role.ROLE_AGENT,
        parts: [{ content: { $case: 'text', value: reply }, metadata: undefined, filename: '', mediaType: 'text/plain' }],
        metadata: undefined,
        extensions: [],
        referenceTaskIds: [],
      }
      eventBus.publish({ kind: 'message', data: message })
      eventBus.finished()
    },
    cancelTask: async () => {},
  }
}

function firstTextPart(parts: readonly Part[]): string {
  for (const part of parts) {
    if (part.content?.$case === 'text') {
      const value = part.content.value.trim()
      if (value) return value
    }
  }
  return ''
}

// The brain replies asynchronously through store.onUpdate → bus.publish with a
// Chat event addressed back to the requesting person, so subscribe before append.
async function askOperator(store: EventStore, bus: Bus<WorldEvent>, operatorId: string, text: string): Promise<string> {
  let unsubscribe: (() => void) | undefined
  try {
    return await new Promise<string>(resolve => {
      const timer = setTimeout(() => resolve(FALLBACK_REPLY), REPLY_TIMEOUT_MS)
      unsubscribe = bus.subscribe(e => {
        if (
          e.type === 'Chat' &&
          e.from?.kind === 'agent' && e.from.id === operatorId &&
          e.to?.kind === 'person' && e.to.id === PEER_ID
        ) {
          clearTimeout(timer)
          resolve(replyTextOf(e))
        }
      })
      store.append({
        type: 'Chat',
        from: { kind: 'person', id: PEER_ID },
        to: { kind: 'agent', id: operatorId },
        title: text,
        payload: { text },
      }).catch(err => console.error(err))
    })
  } finally {
    unsubscribe?.()
  }
}

function replyTextOf(e: WorldEvent): string {
  const text = e.payload?.text
  return typeof text === 'string' && text.length > 0 ? text : FALLBACK_REPLY
}
