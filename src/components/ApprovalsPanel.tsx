import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { deptById, personById } from '../data/company'
import { cx, timeAgo } from '../utils'
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

  const approvals = [...world.approvals].sort((a, b) => b.ts - a.ts)
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
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="text-[13px] font-semibold">Work &amp; Approvals</h2>
        <span
          className={cx(
            PILL, 'text-[11px]',
            approvals.length > 0 ? 'border-human/45 bg-human/10 text-human' : 'border-line bg-raised text-mut',
          )}
        >
          {approvals.length}
        </span>
        <div className="flex-1" />
        <button
          className="rounded px-1.5 py-0.5 text-[13px] text-dim hover:bg-hover hover:text-ink"
          title="Close"
          onClick={() => useStore.getState().closePanel()}
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {approvals.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 px-8 py-14 text-center">
            <span className="mb-1 size-2 rounded-full bg-artifact/70 anim-breathe" />
            <p className="text-[13px] text-ink">Nothing is waiting on a human.</p>
            <p className="max-w-[19rem] text-[11px] leading-relaxed text-dim">
              When an agent gets blocked, the card lands here — routed to the one person who can unblock it.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 p-3">
            {approvals.map((a) => (
              <ApprovalCard
                key={a.eventId}
                approval={a}
                isMine={persona?.id === a.personId}
                viewer={presence.find((p) => p.where === `approval:${a.eventId}`)?.personId ?? null}
                requester={refLabel(a.requestedBy, world.agents)}
                onConnect={() => setOauthId(a.eventId)}
              />
            ))}
          </div>
        )}

        {resolved.length > 0 && (
          <section className="border-t border-line px-3 py-3">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-dim">Recently resolved</div>
            <div className="flex flex-col">
              {resolved.map((e) => (
                <ResolvedRow key={e.id} event={e} />
              ))}
            </div>
          </section>
        )}
      </div>

      {oauthApproval && <OAuthModal approval={oauthApproval} onClose={() => setOauthId(null)} />}
    </div>
  )
}

const RESOLVED_TYPES = new Set(['AccountConnected', 'ApprovalGranted', 'BlueprintApproved'])

/** chip base without a size/color, so per-use utilities never fight `.chip` */
const PILL = 'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium'

const KIND_CHIP: Record<PendingApproval['kind'], { label: string; cls: string }> = {
  auth: { label: 'CONNECT ACCOUNT', cls: 'border-human/45 bg-human/10 text-human' },
  approval: { label: 'APPROVAL', cls: 'border-human/45 bg-human/10 text-human' },
  blueprint: { label: 'NEW AGENT', cls: 'border-task/45 bg-task/10 text-task' },
}

function refLabel(r: Ref | undefined, agents: { id: string; name: string }[]): string | null {
  if (!r) return null
  if (r.kind === 'agent') return agents.find((a) => a.id === r.id)?.name ?? r.id
  if (r.kind === 'person') return personById.get(r.id)?.name ?? r.id
  return 'Policy gateway'
}

// ─── Card ────────────────────────────────────────────────────────────────────

function ApprovalCard({
  approval, isMine, viewer, requester, onConnect,
}: {
  approval: PendingApproval
  isMine: boolean
  viewer: string | null
  requester: string | null
  onConnect: () => void
}) {
  const person = personById.get(approval.personId)
  const dept = approval.deptId ? deptById.get(approval.deptId) : null
  const chip = KIND_CHIP[approval.kind]
  const viewerPerson = viewer ? personById.get(viewer) : null
  const bp = approval.blueprint

  return (
    <article className="anim-fadeup rounded-xl border border-line bg-raised/60 p-3">
      <div className="flex items-center gap-2">
        <span className={cx(PILL, 'font-mono text-[10px] tracking-wider', chip.cls)}>{chip.label}</span>
        {dept && <span className="text-[11px] text-mut">{dept.name}</span>}
        <div className="flex-1" />
        <span className="font-mono text-[10px] text-dim">{timeAgo(approval.ts)}</span>
      </div>

      <p className="mt-2 text-[13px] leading-snug font-medium text-ink">{approval.what}</p>
      {requester && (
        <p className="mt-1 text-[11px] text-dim">
          Requested by <span className="text-mut">{requester}</span>
        </p>
      )}

      {bp && (
        <div className="mt-2.5 rounded-lg border border-line bg-raised/60 p-2.5">
          <Field label="Purpose" value={bp.purpose} />
          <Field label="Trigger" value={bp.trigger} />
          <div className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-dim">Limits</div>
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {bp.limits.slice(0, 3).map((l) => (
              <li key={l} className="flex items-start gap-1.5 text-[11px] text-mut">
                <span className="mt-[3px] size-1 shrink-0 rounded-full bg-artifact/80" />
                {l}
              </li>
            ))}
          </ul>
          <button
            className="btn mt-2.5 h-7 px-2 text-[11px]"
            onClick={() => useStore.getState().openPanel('diff')}
          >
            View inheritance
          </button>
        </div>
      )}

      {/* the named human this is routed to */}
      <div className="mt-2.5 flex items-center gap-2.5 rounded-lg border border-line bg-raised/60 px-2.5 py-2">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-linebright text-[10px] font-bold"
          style={{ background: person ? `hsl(${person.hue} 52% 87%)` : 'var(--color-raised)' }}
        >
          {person?.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium">{person?.name ?? approval.personId}</span>
            {isMine && (
              <span className={cx(PILL, 'shrink-0 border-task/45 bg-task/10 text-[10px] text-task')}>assigned to you</span>
            )}
          </div>
          <span className="block truncate text-[11px] text-dim">{person?.role}</span>
        </div>
        {viewerPerson && (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-artifact">
            <span className="size-1.5 animate-pulse rounded-full bg-artifact" />
            {viewerPerson.name.split(' ')[0]} is viewing
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        {approval.kind === 'auth' ? (
          <button className="btn btn-primary h-8 text-[12px]" onClick={onConnect}>
            Connect account…
          </button>
        ) : (
          <button
            className={cx('btn h-8 text-[12px]', approval.kind === 'blueprint' ? 'btn-primary' : 'btn-human')}
            onClick={() => useStore.getState().approve(approval)}
          >
            Approve
          </button>
        )}
        {approval.taskId && (
          <button
            className="btn h-8 text-[12px] text-mut"
            onClick={() => useStore.getState().selectTask(approval.taskId ?? null)}
          >
            Focus on map
          </button>
        )}
      </div>
      {!isMine && person && (
        <p className="mt-1.5 text-[10px] text-dim">acting for {person.name} (demo)</p>
      )}
    </article>
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

// ─── Mock OAuth ──────────────────────────────────────────────────────────────

const SCOPES = [
  'View Q3 report data (read-only)',
  'Act as a scoped service capability — CoOps never sees your password',
]

function OAuthModal({ approval, onClose }: { approval: PendingApproval; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const person = personById.get(approval.personId)
  const email = `${approval.personId}@everpeak.co`

  // keep the latest props without re-arming the connect timer
  const latest = useRef({ approval, onClose })
  useEffect(() => {
    latest.current = { approval, onClose }
  })

  useEffect(() => {
    if (step !== 3) return
    const t = setTimeout(() => {
      useStore.getState().approve(latest.current.approval)
      latest.current.onClose()
    }, 1100)
    return () => clearTimeout(t)
  }, [step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25">
      <div className="panel anim-fadeup w-[420px] overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <GoogleGlyph />
          <span className="text-[13px] font-medium">Sign in with Google</span>
          <div className="flex-1" />
          <button
            className="rounded px-1.5 py-0.5 text-[13px] text-dim hover:bg-hover hover:text-ink"
            title="Cancel"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {step === 1 && (
          <div className="p-4">
            <div className="text-[15px] font-medium">Choose an account</div>
            <div className="mt-0.5 text-[11px] text-dim">to continue to CoOps</div>
            <button
              className="mt-3 flex w-full items-center gap-3 rounded-lg border border-line bg-raised px-3 py-2.5 text-left hover:border-linebright hover:bg-hover"
              onClick={() => setStep(2)}
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
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

        {step === 2 && (
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

        {step === 3 && (
          <div className="flex flex-col items-center gap-3 px-4 py-10">
            <span className="size-6 animate-spin rounded-full border-2 border-line border-t-task" />
            <span className="text-[13px] text-mut">Connecting {approval.what}…</span>
            <span className="text-[11px] text-dim">Issuing a scoped capability to the agent</span>
          </div>
        )}

        <div className="border-t border-line px-4 py-2.5 text-[10px] leading-relaxed text-dim">
          Demo OAuth — the agent receives a scoped capability, never the raw credential.
        </div>
      </div>
    </div>,
    document.body,
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
