import { useMemo } from 'react'
import { useStore } from '../store'
import { artifactEventName, buildArtifactDoc } from '../data/artifactContent'
import { deptById, personById } from '../data/company'
import { cx, fmtClock, fmtDay } from '../utils'
import { Chip, Pill } from '../components/ui'
import type { Ref, World, WorldEvent } from '../types'

/** Library of the documents delivered by the running world. */
export default function DocumentsPage() {
  const log = useStore((s) => s.log)
  const world = useStore((s) => s.world)
  const documents = useMemo(
    () => log
      .filter((event) => event.type === 'ArtifactDelivered')
      .sort((a, b) => b.ts - a.ts),
    [log],
  )

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto overscroll-contain bg-surface">
      <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col px-5 py-6 lg:px-8 lg:py-7">
        <header className="flex shrink-0 items-end justify-between gap-4 border-b border-line pb-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-dim">Delivered work</div>
            <h2 className="mt-1.5 text-[21px] font-semibold tracking-[-0.02em]">Documents</h2>
            <p className="mt-1.5 text-[12px] text-dim">Artifacts delivered by the company runtime, ready to open and review.</p>
          </div>
          <Chip>{documents.length} {documents.length === 1 ? 'document' : 'documents'}</Chip>
        </header>

        <div className="mt-5 min-w-0 flex-1 overflow-x-auto border-y border-line">
          {documents.length === 0 ? (
            <div className="px-3 py-14 text-center">
              <div className="text-[13px] font-medium text-ink">No documents have been delivered yet.</div>
              <div className="mt-1.5 text-[11px] text-dim">Completed work will appear here as the company runs.</div>
            </div>
          ) : (
            <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[20%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead className="bg-raised/55">
                <tr className="border-b border-line">
                  <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Document</th>
                  <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Type</th>
                  <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Desk</th>
                  <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Task</th>
                  <th className="px-3 py-2.5 text-right font-mono text-[10px] font-medium uppercase tracking-wider text-dim">Delivered</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((event) => (
                  <DocumentRow key={event.id} event={event} world={world} />
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-3 shrink-0 text-[10px] text-dim">Select a row to open the letterhead viewer.</p>
      </div>
    </div>
  )
}

function DocumentRow({ event, world }: { event: WorldEvent; world: World }) {
  const doc = buildArtifactDoc(event, {
    task: event.taskId ? world.tasks.get(event.taskId) : undefined,
    agents: world.agents,
  })
  const dept = event.deptFrom ? deptById.get(event.deptFrom) : undefined
  const task = event.taskId ? world.tasks.get(event.taskId) : undefined
  const name = artifactEventName(event)
  const from = refLabel(event.from, world)

  return (
    <tr
      tabIndex={0}
      className="cursor-pointer border-b border-line/60 align-middle transition-colors hover:bg-artifact/8 focus:bg-artifact/8 focus:outline-none"
      onClick={() => useStore.getState().openArtifact(event.id)}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
          keyEvent.preventDefault()
          useStore.getState().openArtifact(event.id)
        }
      }}
      title={`Open ${doc.title}`}
    >
      <td className="px-3 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[4px] border border-artifact/35 bg-artifact/8 text-artifact" aria-hidden>
            <DocumentGlyph />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-ink" title={doc.title}>{doc.title}</div>
            <div className="mt-0.5 truncate text-[10px] text-dim" title={from ? `Prepared by ${from}` : name}>{from ? `Prepared by ${from}` : name}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3"><Pill className="text-[9px] text-artifact">{doc.label}</Pill></td>
      <td className="px-3 py-3 text-[11px] text-mut">{dept?.name ?? 'Company'}</td>
      <td className="max-w-0 px-3 py-3">
        <div className={cx('truncate text-[11px]', task ? 'text-ink' : 'text-dim')} title={task?.title}>{task?.title ?? 'Unlinked delivery'}</div>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="font-mono text-[10px] text-mut tabular-nums">{fmtDay(event.ts)}</div>
        <div className="mt-0.5 font-mono text-[10px] text-dim tabular-nums">{fmtClock(event.ts)}</div>
      </td>
    </tr>
  )
}

function refLabel(ref: Ref | undefined, world: World): string | null {
  if (!ref) return null
  if (ref.kind === 'agent') return world.agents.find((agent) => agent.id === ref.id)?.name ?? ref.id
  if (ref.kind === 'person') return personById.get(ref.id)?.name ?? ref.id
  return 'Agent Gateway'
}

function DocumentGlyph() {
  return (
    <svg viewBox="0 0 12 14" className="size-3" aria-hidden="true">
      <path d="M2 1.25h5.2L10 4.05v8.7H2z" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M7 1.25v2.8h3M4 7h4M4 9.25h4" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}
