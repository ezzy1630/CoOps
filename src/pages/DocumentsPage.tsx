import { useMemo, type MouseEvent } from 'react'
import { useStore } from '../store'
import { artifactEventName, buildArtifactDoc } from '../data/artifactContent'
import { deptById, personById } from '../data/company'
import { cx, fmtClock, fmtDay } from '../utils'
import { Pill } from '../components/ui'
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
      <div className="flex w-full min-w-0 flex-1 flex-col px-6 py-4 lg:px-9">
        <header className="flex h-10 shrink-0 items-baseline gap-4 border-b border-line">
          <h2 className="text-[17px] font-semibold tracking-[-0.025em]">Documents</h2>
          <span className="font-mono text-[10px] tabular-nums text-dim">{documents.length} delivered</span>
          <span className="ml-auto text-[10px] text-dim">New work appears here when agents deliver it</span>
        </header>

        <div className="min-w-0 flex-1 overflow-x-auto">
          {documents.length === 0 ? (
            <div className="px-3 py-14 text-center">
              <div className="text-[13px] font-medium text-ink">No documents have been delivered yet.</div>
              <div className="mt-1.5 text-[11px] text-dim">Completed work will appear here as the company runs.</div>
            </div>
          ) : (
            <table className="w-full min-w-[1100px] table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[14%]" />
                <col className="w-[13%]" />
                <col className="w-[21%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-line">
                  {['Document', 'Type', 'Desk', 'Task'].map((label) => <th key={label} className="px-3 py-2 text-[10px] font-medium text-dim">{label}</th>)}
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-dim">Delivered</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-dim">Open</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((event, index) => (
                  <DocumentRow key={event.id} event={event} world={world} index={index} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function DocumentRow({ event, world, index }: { event: WorldEvent; world: World; index: number }) {
  const doc = buildArtifactDoc(event, {
    task: event.taskId ? world.tasks.get(event.taskId) : undefined,
    agents: world.agents,
  })
  const dept = event.deptFrom ? deptById.get(event.deptFrom) : undefined
  const task = event.taskId ? world.tasks.get(event.taskId) : undefined
  const name = artifactEventName(event)
  const from = refLabel(event.from, world)
  const deptHue = personById.get(dept?.leadId ?? '')?.hue

  const openOnMap = () => {
    const store = useStore.getState()
    const source = event.from
    const deliveringAgent = source?.kind === 'agent' && world.agents.some((agent) => agent.id === source.id)
      ? source.id
      : null
    if (deliveringAgent) {
      store.requestCamera({ type: 'agent', agentId: deliveringAgent })
      store.openPanel('agent', deliveringAgent)
    } else if (event.deptFrom) {
      store.requestCamera({ type: 'dept', deptId: event.deptFrom })
      store.openPanel('dept', event.deptFrom)
    } else {
      store.setView('map')
    }
  }

  const openDocument = (click: MouseEvent<HTMLButtonElement>) => {
    click.stopPropagation()
    useStore.getState().openArtifact(event.id)
  }

  return (
    <tr
      tabIndex={0}
      className="group anim-fadeup cursor-pointer border-b border-line/60 align-middle transition-colors hover:bg-artifact/8 focus:bg-artifact/8 focus:outline-none"
      style={{ animationDelay: `${Math.min(index * 35, 240)}ms` }}
      onClick={openOnMap}
      onKeyDown={(keyEvent) => {
        if (keyEvent.target !== keyEvent.currentTarget) return
        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
          keyEvent.preventDefault()
          openOnMap()
        }
      }}
      title="Open on map"
    >
      <td className="px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-5 w-0.5 shrink-0 rounded-full" style={{ background: deptHue == null ? 'var(--color-linebright)' : `hsl(${deptHue} 55% 50%)` }} aria-hidden />
          <span className="relative flex size-5 shrink-0 items-center justify-center border border-artifact/35 text-artifact" aria-hidden>
            <DocumentGlyph />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[12px] font-medium text-ink" title={doc.title}>{doc.title}</div>
            <div className="mt-0.5 truncate text-[10px] text-dim" title={from ? `Prepared by ${from}` : name}>{from ? `Prepared by ${from}` : name}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-1.5"><Pill className="text-[9px] text-artifact">{doc.label}</Pill></td>
      <td className="px-3 py-1.5 text-[11px] text-mut">{dept?.name ?? 'Company'}</td>
      <td className="max-w-0 px-3 py-1.5">
        <div className={cx('truncate text-[11px]', task ? 'text-ink' : 'text-dim')} title={task?.title}>{task?.title ?? 'Unlinked delivery'}</div>
      </td>
      <td className="px-3 py-1.5 text-right">
        <div className="font-mono text-[10px] text-mut tabular-nums">{fmtDay(event.ts)}</div>
        <div className="mt-0.5 font-mono text-[10px] text-dim tabular-nums">{fmtClock(event.ts)}</div>
      </td>
      <td className="px-3 py-1.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <span className="pointer-events-none text-[10px] text-task opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">Open on map ↗</span>
          <button type="button" className="btn h-7 whitespace-nowrap px-2 text-[10px]" onClick={openDocument} title="Open the delivered document">
            Open
          </button>
        </div>
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
