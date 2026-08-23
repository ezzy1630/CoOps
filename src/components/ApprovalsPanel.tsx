import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { backendUrl } from '../live'
import { deptById, personById, TOOLS } from '../data/company'
import { cx, timeAgo } from '../utils'
import { Chip, Pill } from './ui'
import type { PendingApproval, Ref, WorldEvent } from '../types'

/**
 * Work & Approvals — everything in the company that is waiting on a human,
 * each item routed to the one named person who can unblock it.
 */
export default function ApprovalsPanel() {
  const world = useStore((s) => s.world)
  const log = useStore((s) => s.log)
  const persona = useStore((s) => s.persona)
  const presence = useStore((s) => s.presence)
  const [oauthId, setOauthId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ApprovalFilter>('all')

  const approvals = [...world.approvals].sort((a, b) => b.ts - a.ts)
  const visibleApprovals = approvals.filter((approval) => {
    if (filter === 'mine') return persona?.id === approval.personId
    if (filter === 'auth') return approval.kind === 'auth'
    if (filter === 'approval') return approval.kind === 'approval'
    if (filter === 'blueprint') return approval.kind === 'blueprint'
    return true
  })
  const oauthApproval = oauthId ? approvals.find((a) => a.eventId === oauthId) ?? null : null

  // if a simulated colleague resolves the request while the flow is open, step aside
  useEffect(() => {
    if (oauthId && !oauthApproval) setOauthId(null)
  }, [oauthId, oauthApproval])

  const cutoff = Date.now() - 30 * 60_000
  const resolved = log
    .filter((e) => RESOLVED_TYPES.has(e.type) && e.ts >= cutoff)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8)

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto overscroll-contain bg-surface">
      <div className="flex w-full min-w-0 flex-1 flex-col px-6 py-4 lg:px-9">
        <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line">
          <h2 className="text-[17px] font-semibold tracking-[-0.025em]">Approvals</h2>
          <span className={cx('font-mono text-[10px] tabular-nums', approvals.length > 0 ? 'text-human' : 'text-dim')}>{approvals.length} waiting</span>
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5">
            <QueueFilterButton label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
            <QueueFilterButton label="Assigned to me" active={filter === 'mine'} onClick={() => setFilter('mine')} />
            <QueueFilterButton label="Accounts" active={filter === 'auth'} onClick={() => setFilter('auth')} />
            <QueueFilterButton label="Sign-offs" active={filter === 'approval'} onClick={() => setFilter('approval')} />
            <QueueFilterButton label="New agents" active={filter === 'blueprint'} onClick={() => setFilter('blueprint')} />
          </div>
        </header>

        <div className="min-w-0 flex-1">
          {visibleApprovals.length === 0 ? (
            approvals.length === 0 ? <EmptyState /> : <FilteredEmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[15%]" />
                  <col className="w-[31%]" />
                  <col className="w-[18%]" />
                  <col className="w-[12%]" />
                  <col className="w-[24%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line">
                    {['Type', 'Request', 'Routed to', 'Age'].map((label) => <th key={label} className="px-3 py-2 text-[10px] font-medium text-dim">{label}</th>)}
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-dim">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleApprovals.map((a) => (
                    <ApprovalRow
                      key={a.eventId}
                      approval={a}
                      isMine={persona?.id === a.personId}
                      viewer={presence.find((p) => p.where === `approval:${a.eventId}`)?.personId ?? null}
                      requester={refLabel(a.requestedBy, world.agents)}
                      onConnect={() => setOauthId(a.eventId)}
                      onOpenMap={() => openApprovalOnMap(a, world)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {resolved.length > 0 && (
            <section className="mt-8">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-medium text-mut">Recently resolved</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="border-y border-line">
                {resolved.map((e) => (
                  <ResolvedRow key={e.id} event={e} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {oauthApproval && <OAuthModal approval={oauthApproval} onClose={() => setOauthId(null)} />}
    </div>
  )
}

const RESOLVED_TYPES = new Set(['AccountConnected', 'ApprovalGranted', 'BlueprintApproved'])

type ApprovalFilter = 'all' | 'mine' | 'auth' | 'approval' | 'blueprint'

/**
 * Tailwind emits same-property utilities alphabetically, so `border-human` and
 * `bg-human` lose to the shared atoms' `border-line`/`bg-surface`. The human
 * tint has to be marked important to repaint a Chip/Pill; the task tint sorts
 * after them and wins on its own.
 */
const HUMAN_TINT = 'border-human/45! bg-human/10! text-human!'
const TASK_TINT = 'border-task/45 bg-task/10 text-task'

const KIND_CHIP: Record<PendingApproval['kind'], { label: string; cls: string }> = {
  auth: { label: 'CONNECT ACCOUNT', cls: HUMAN_TINT },
  approval: { label: 'APPROVAL', cls: HUMAN_TINT },
  blueprint: { label: 'NEW AGENT', cls: TASK_TINT },
}

function QueueFilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className="inline-flex cursor-pointer" onClick={onClick}>
      <Chip className={cx('transition-colors', active ? 'border-task/55 text-task' : 'border-transparent hover:border-linebright hover:text-ink')}>
        {label}
      </Chip>
    </button>
  )
}

function refLabel(r: Ref | undefined, agents: { id: string; name: string }[]): string | null {
  if (!r) return null
  if (r.kind === 'agent') return agents.find((a) => a.id === r.id)?.name ?? r.id
  if (r.kind === 'person') return personById.get(r.id)?.name ?? r.id
  return 'Policy gateway'
}

function openApprovalOnMap(approval: PendingApproval, world: ReturnType<typeof useStore.getState>['world']) {
  const store = useStore.getState()
  const requestedBy = approval.requestedBy
  const requestedAgent = requestedBy?.kind === 'agent' && world.agents.some((agent) => agent.id === requestedBy.id)
    ? requestedBy.id
    : null

  if (requestedAgent) {
    store.requestCamera({ type: 'agent', agentId: requestedAgent })
    store.openPanel('agent', requestedAgent)
  } else if (approval.deptId) {
    store.requestCamera({ type: 'dept', deptId: approval.deptId })
    store.openPanel('dept', approval.deptId)
  } else {
    store.setView('map')
  }
}

function CapabilityGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="mr-1 inline size-2.5" aria-hidden="true">
      <rect x="3" y="5" width="6" height="5" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M4.5 5V3.8a1.5 1.5 0 0 1 3 0V5" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

// ─── Queue row ───────────────────────────────────────────────────────────────

function ApprovalRow({
  approval, isMine, viewer, requester, onConnect, onOpenMap,
}: {
  approval: PendingApproval
  isMine: boolean
  viewer: string | null
  requester: string | null
  onConnect: () => void
  onOpenMap: () => void
}) {
  const person = personById.get(approval.personId)
  const dept = approval.deptId ? deptById.get(approval.deptId) : null
  const chip = KIND_CHIP[approval.kind]
  const viewerPerson = viewer ? personById.get(viewer) : null
  const bp = approval.blueprint
  const deptHue = personById.get(dept?.leadId ?? approval.personId)?.hue

  return (
    <>
      <tr
        tabIndex={0}
        className="group anim-fadeup cursor-pointer border-b border-line align-top transition-colors hover:bg-hover/35 focus:bg-hover/35 focus:outline-none"
        onClick={onOpenMap}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpenMap()
          }
        }}
        title="Open on map"
      >
        <td className="px-3 py-1.5">
          <span className="mr-2 inline-block h-5 w-0.5 rounded-full align-middle" style={{ background: deptHue == null ? 'var(--color-linebright)' : `hsl(${deptHue} 55% 50%)` }} aria-hidden />
          <Pill className={cx(chip.cls, 'text-[9px]')}><CapabilityGlyph />{chip.label}</Pill>
          {dept && <div className="mt-1.5 text-[11px] text-dim">{dept.name}</div>}
        </td>
        <td className="px-3 py-1.5">
          <div className="max-w-[34rem] text-[13px] leading-snug font-medium text-ink">{approval.what}</div>
          {requester && (
            <div className="mt-1 text-[11px] text-dim">
              Requested by <span className="text-mut">{requester}</span>
            </div>
          )}
          {bp && <div className="mt-1 font-mono text-[10px] text-task">Blueprint review · inheritance limits</div>}
        </td>
        <td className="px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cx('flex size-7 shrink-0 items-center justify-center rounded-full border border-linebright text-[9px] font-bold', person && 'text-abyss')}
              style={{ background: person ? `hsl(${person.hue} 52% 87%)` : 'var(--color-raised)' }}
            >
              {person?.initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium">{person?.name ?? approval.personId}</div>
              <div className="truncate text-[10px] text-dim">{person?.role}</div>
            </div>
          </div>
          {isMine && <Chip className={cx('mt-1.5 text-[10px]', TASK_TINT)}>assigned to you</Chip>}
          {viewerPerson && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-artifact">
              <span className="size-1.5 rounded-full bg-artifact" />
              {viewerPerson.name.split(' ')[0]} is viewing
            </div>
          )}
        </td>
        <td className="px-3 py-1.5 font-mono text-[11px] text-dim tabular-nums">{timeAgo(approval.ts)}</td>
        <td className="px-3 py-1.5 text-right">
          <div className="flex flex-wrap justify-end gap-1.5">
            {approval.kind === 'auth' ? (
              <button className="btn btn-primary h-7 px-2.5 text-[11px]" onClick={(event) => { event.stopPropagation(); onConnect() }}>
                Connect account…
              </button>
            ) : (
              <button
                className={cx('btn h-7 px-2.5 text-[11px]', approval.kind === 'blueprint' ? 'btn-primary' : 'btn-human')}
                onClick={(event) => { event.stopPropagation(); useStore.getState().approve(approval) }}
              >
                Approve
              </button>
            )}
            {approval.taskId && (
              <button
                className="btn h-7 px-2.5 text-[11px] text-mut"
                onClick={(event) => {
                  event.stopPropagation()
                  useStore.getState().selectTask(approval.taskId ?? null)
                  onOpenMap()
                }}
              >
                Focus on map
              </button>
            )}
          </div>
          {bp && (
            <button
              className="mt-2 text-[10px] text-dim underline decoration-linebright underline-offset-2 hover:text-ink"
              onClick={(event) => { event.stopPropagation(); useStore.getState().openPanel('diff') }}
            >
              View inheritance
            </button>
          )}
          {!isMine && person && <div className="mt-1.5 text-[10px] text-dim">acting for {person.name} (demo)</div>}
          <div className="mt-1 text-[10px] text-task opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">Open on map ↗</div>
        </td>
      </tr>
      {bp && (
        <tr className="border-b border-line bg-raised/25">
          <td colSpan={5} className="px-3 py-2">
            <div className="grid gap-3 pl-1 text-[11px] text-mut md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
              <Field label="Purpose" value={bp.purpose} />
              <Field label="Trigger" value={bp.trigger} />
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-dim">Limits</div>
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {bp.limits.slice(0, 3).map((l) => (
                    <li key={l} className="flex items-start gap-1.5">
                      <span className="mt-[4px] size-1 shrink-0 rounded-full bg-artifact/80" />
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

/** Generic stands-ins for the capability diagram's person and agent chips. */
function AgentMark() {
  return (
    <span
      aria-hidden
      className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-linebright bg-surface"
    >
      <span className="size-1.5 rounded-[1px] bg-task/70" />
    </span>
  )
}

function PersonMark() {
  return (
    <span
      aria-hidden
      className="flex size-4 shrink-0 items-center justify-center rounded-full border border-linebright bg-surface"
    >
      <span className="size-1.5 rounded-full bg-human/70" />
    </span>
  )
}

/**
 * Idle, but not blank: the same person → capability → agent grammar the OAuth
 * flow ends on, drawn generically to explain what this panel is *for*.
 */
function EmptyState() {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-8 py-16 text-center">
      <div className="flex items-center justify-center gap-1">
        <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-raised px-2 py-1.5">
          <AgentMark />
          <span className="text-[10.5px] font-medium text-ink">Any agent</span>
        </span>

        <ScopeArrow label="hits a wall" />

        <span className="shrink-0 rounded-md border border-human/45 bg-human/10 px-2 py-1.5">
          <span className="block font-mono text-[8.5px] tracking-wide text-human">
            credential · sign-off
          </span>
        </span>

        <ScopeArrow label="routed to" />

        <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-raised px-2 py-1.5">
          <PersonMark />
          <span className="text-[10.5px] font-medium text-ink">one named human</span>
        </span>
      </div>

      <p className="mt-6 text-[13px] font-medium text-ink">Nothing is waiting on a human.</p>
      <p className="mt-1.5 max-w-[23rem] text-[11.5px] leading-relaxed text-dim">
        When an agent hits a wall — a credential, a sign-off — it appears here, addressed to the one
        person who can clear it.
      </p>
    </div>
  )
}

function FilteredEmptyState() {
  return (
    <div className="border-y border-line px-4 py-10 text-center text-[11px] text-dim">
      No open requests match this filter.
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="font-mono text-[10px] uppercase tracking-wider text-dim">{label}</div>
      <div className="text-[11px] leading-snug text-mut">{value}</div>
    </div>
  )
}

function ResolvedRow({ event }: { event: WorldEvent }) {
  const by = event.from?.kind === 'person' ? personById.get(event.from.id)?.name : null
  return (
    <div className="flex items-center gap-2 border-b border-line/50 py-1.5 last:border-b-0">
      <span className="size-1.5 shrink-0 rounded-full bg-artifact/80" />
      <span className="min-w-0 flex-1 truncate text-[11px] text-mut">{event.title}</span>
      {by && <span className="shrink-0 text-[11px] text-dim">{by}</span>}
      <span className="shrink-0 font-mono text-[10px] text-dim">{timeAgo(event.ts)}</span>
    </div>
  )
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

const SCOPES = [
  'View Q3 report data (read-only)',
  'Act as a scoped service capability — CoOps never sees your password',
]

let googleAuthEnabled: boolean | null = null

async function resolveGoogleAuth(): Promise<boolean> {
  if (googleAuthEnabled !== null) return googleAuthEnabled
  try {
    const res = await fetch(`${backendUrl()}/auth/google/status`)
    const data = (await res.json()) as { enabled?: boolean }
    googleAuthEnabled = res.ok && data.enabled === true
  } catch {
    googleAuthEnabled = false
  }
  return googleAuthEnabled
}

function OAuthModal({ approval, onClose }: { approval: PendingApproval; onClose: () => void }) {
  const [mode, setMode] = useState<'checking' | 'sandbox' | 'redirect'>(() =>
    googleAuthEnabled === false ? 'sandbox' : 'checking',
  )
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [connected, setConnected] = useState(false)
  const person = personById.get(approval.personId)
  const email = `${approval.personId}@everpeak.co`

  useEffect(() => {
    let cancelled = false
    void resolveGoogleAuth().then((enabled) => {
      if (cancelled) return
      if (!enabled) {
        setMode('sandbox')
        return
      }
      setMode('redirect')
      window.location.assign(`${backendUrl()}/auth/google/start`)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // keep the latest props without re-arming the connect timer
  const latest = useRef({ approval, onClose, step })
  useEffect(() => {
    latest.current = { approval, onClose, step }
  })

  // once "Allow" is clicked the grant goes through, even if the modal is dismissed early
  const resolvedRef = useRef(false)
  const finish = () => {
    if (!resolvedRef.current) {
      resolvedRef.current = true
      useStore.getState().approve(latest.current.approval)
    }
    latest.current.onClose()
  }
  const requestClose = () => {
    if (latest.current.step === 3) finish()
    else latest.current.onClose()
  }

  useEffect(() => {
    if (step !== 3) return
    // brief connecting spinner, then the capability diagram, then resolve
    const t1 = setTimeout(() => setConnected(true), 950)
    const t2 = setTimeout(finish, 4200)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        requestClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25">
      <div className="panel anim-fadeup w-[420px] overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          {mode === 'redirect' && <GoogleGlyph />}
          <span className="text-[13px] font-medium">
            {mode === 'sandbox' ? 'Simulated connection — sandbox' : mode === 'redirect' ? 'Sign in with Google' : 'Connect account'}
          </span>
          <div className="flex-1" />
          <button
            className="rounded px-1.5 py-0.5 text-[13px] text-dim hover:bg-hover hover:text-ink"
            title="Cancel"
            onClick={requestClose}
          >
            ✕
          </button>
        </div>

        {mode === 'checking' && (
          <div className="flex flex-col items-center gap-3 px-4 py-10">
            <span className="size-6 animate-spin rounded-full border-2 border-line border-t-task" />
            <span className="text-[11px] text-dim">Checking sign-in options…</span>
          </div>
        )}

        {mode === 'redirect' && (
          <div className="flex flex-col items-center gap-3 px-4 py-10">
            <span className="size-6 animate-spin rounded-full border-2 border-line border-t-task" />
            <span className="text-[13px] text-mut">Redirecting to Google sign-in…</span>
          </div>
        )}

        {mode === 'sandbox' && (
          <div className="border-b border-human/45 bg-human/10 px-4 py-2 text-[11px] leading-relaxed text-human">
            No Google credentials configured on the backend. This dialog demonstrates the flow locally; nothing is verified.
          </div>
        )}

        {mode === 'sandbox' && step === 1 && (
          <div className="p-4">
            <div className="text-[15px] font-medium">Choose an account</div>
            <div className="mt-0.5 text-[11px] text-dim">to continue to CoOps</div>
            <button
              className="mt-3 flex w-full items-center gap-3 rounded-lg border border-line bg-raised px-3 py-2.5 text-left hover:border-linebright hover:bg-hover"
              onClick={() => setStep(2)}
            >
              <span
                className={cx('flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold', person && 'text-abyss')}
                style={{ background: person ? `hsl(${person.hue} 52% 87%)` : 'var(--color-raised)' }}
              >
                {person?.initials}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px]">{person?.name}</span>
                <span className="block truncate text-[11px] text-dim">{email}</span>
              </span>
            </button>
            <div className="mt-1.5 flex w-full items-center gap-3 rounded-lg border border-line/60 px-3 py-2.5 text-[13px] text-dim">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-[13px]">+</span>
              Use another account
            </div>
          </div>
        )}

        {mode === 'sandbox' && step === 2 && (
          <div className="p-4">
            <div className="text-[15px] font-medium">CoOps wants access</div>
            <div className="mt-0.5 text-[11px] text-dim">
              {approval.what} · {email}
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {SCOPES.map((s) => (
                <li key={s} className="flex items-start gap-2.5 rounded-lg border border-line bg-raised px-3 py-2.5">
                  <span className="mt-[3px] shrink-0 text-[11px] text-task">✓</span>
                  <span className="text-[12px] leading-snug text-mut">{s}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn h-8 text-[12px] text-mut" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary h-8 text-[12px]" onClick={() => setStep(3)}>
                Allow
              </button>
            </div>
          </div>
        )}

        {mode === 'sandbox' && step === 3 && !connected && (
          <div className="flex flex-col items-center gap-3 px-4 py-10">
            <span className="size-6 animate-spin rounded-full border-2 border-line border-t-task" />
            <span className="text-[13px] text-mut">Connecting {approval.what}…</span>
            <span className="text-[11px] text-dim">Issuing a scoped capability to the agent</span>
          </div>
        )}

        {mode === 'sandbox' && step === 3 && connected && (
          <div className="anim-fadeup flex flex-col items-center px-4 pt-7 pb-5">
            <span className="flex size-7 items-center justify-center rounded-full border border-ok/45 bg-ok/10 text-[13px] text-ok">
              ✓
            </span>
            <span className="mt-2.5 text-[13px] font-medium">Connected</span>
            <span className="mt-0.5 text-[11px] text-dim">A scoped capability was issued</span>
            <CapabilityDiagram approval={approval} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * The security story in one glyph: the human grants a capability, the
 * capability is scoped to one agent. The credential itself never moves.
 */
function CapabilityDiagram({ approval }: { approval: PendingApproval }) {
  const agents = useStore((s) => s.world.agents)
  const person = personById.get(approval.personId)
  const agentName = refLabel(approval.requestedBy, agents) ?? 'Requesting agent'

  const what = approval.what.toLowerCase()
  const tool =
    TOOLS.find((t) => what.includes(t.name.toLowerCase()) || what.includes(t.id)) ??
    TOOLS.find((t) => t.ownerId === approval.personId && t.requiresAuth)
  const slug =
    tool?.id ??
    approval.what.replace(/^connect\s+/i, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
  const scope = `${slug}.reports.read`

  return (
    <div className="mt-5 w-full">
      <div className="flex w-full items-center justify-center gap-1">
        <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-raised px-1.5 py-1">
          <span
            className="flex size-4 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-abyss"
            style={{ background: person ? `hsl(${person.hue} 52% 87%)` : 'var(--color-raised)' }}
          >
            {person?.initials}
          </span>
          <span className="text-[10px] font-medium text-ink">{person?.name.split(' ')[0] ?? approval.personId}</span>
        </span>

        <ScopeArrow label="grants" />

        <span className="min-w-0 shrink rounded-md border border-human/45 bg-human/10 px-1.5 py-1">
          <span className="block truncate font-mono text-[8.5px] text-human">{scope}</span>
        </span>

        <ScopeArrow label="scoped to" />

        <span className="max-w-24 shrink-0 rounded-md border border-line bg-raised px-1.5 py-1 text-center text-[10px] leading-[1.2] font-medium text-ink">
          {agentName}
        </span>
      </div>
      <p className="mx-auto mt-3 max-w-72 text-center text-[10px] leading-relaxed text-dim">
        The credential never leaves the vault — the agent holds a scoped, revocable capability.
      </p>
    </div>
  )
}

function ScopeArrow({ label }: { label: string }) {
  return (
    <span className="flex shrink-0 flex-col items-center gap-px px-0.5">
      <span className="font-mono text-[7.5px] tracking-wide whitespace-nowrap text-human">{label}</span>
      <svg width="32" height="6" viewBox="0 0 32 6" aria-hidden className="text-human">
        <path
          d="M1 3h27M25 1l3.5 2L25 5"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.6"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function GoogleGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z" />
      <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3a11.5 11.5 0 0 0 10.2 6.3z" />
      <path fill="#FBBC05" d="M5.6 14.2a6.9 6.9 0 0 1 0-4.4v-3H1.8a11.5 11.5 0 0 0 0 10.4l3.8-3z" />
      <path fill="#EA4335" d="M12 5.4c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.5 11.5 0 0 0 1.8 6.8l3.8 3c.9-2.7 3.4-4.4 6.4-4.4z" />
    </svg>
  )
}
