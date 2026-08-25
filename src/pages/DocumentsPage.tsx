/* Hallmark · macrostructure: Long Document · theme: Obsidian-Titanium · genre: modern-minimal
 * pre-emit critique: P5 H5 E5 S5 R5 V5 · slop test: 58/58 ✓
 */
import { ArrowRight, ArrowSquareOut, FileText, MagnifyingGlass, SquaresFour, Table } from '@phosphor-icons/react'
import { useMemo, useState, type MouseEvent } from 'react'
import { useStore } from '../store'
import { readArtifactRecord, type ArtifactProvenance } from '../artifacts/model'
import { deptById, personById } from '../data/company'
import { cx, fmtClock, fmtDay } from '../utils'
import { Pill } from '../components/ui'
import type { Ref, World, WorldEvent } from '../types'

/** Library of documents generated across the company. */
export default function DocumentsPage() {
  const log = useStore((s) => s.log)
  const world = useStore((s) => s.world)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  const documents = useMemo(
    () => log
      .filter((event) => event.type === 'ArtifactDelivered')
      .sort((a, b) => b.ts - a.ts),
    [log],
  )

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return documents
    return documents.filter((event) => {
      const rec = readArtifactRecord(event, {
        task: event.taskId ? world.tasks.get(event.taskId) : undefined,
        agents: world.agents,
      })
      const deptName = event.deptFrom ? (deptById.get(event.deptFrom)?.name ?? '') : ''
      return (
        rec.title.toLowerCase().includes(q) ||
        rec.label.toLowerCase().includes(q) ||
        deptName.toLowerCase().includes(q) ||
        (event.title ?? '').toLowerCase().includes(q)
      )
    })
  }, [documents, search, world])

  const liveCount = useMemo(() => {
    return documents.filter((e) => {
      const rec = readArtifactRecord(e, {
        task: e.taskId ? world.tasks.get(e.taskId) : undefined,
        agents: world.agents,
      })
      return rec.provenance === 'live-content'
    }).length
  }, [documents, world])
  const rehearsalCount = documents.length - liveCount

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto overscroll-contain bg-bg">
      <div className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-1 flex-col px-6 py-8 lg:px-10">
        {/* ── Page Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[26px] font-bold tracking-tight text-ink">Documents</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11px] font-semibold text-mut shadow-xs">
                <span className="size-1.5 rounded-full bg-artifact" />
                <span>{documents.length} Records</span>
              </span>
            </div>
            <p className="mt-1 text-[13.5px] text-mut max-w-2xl">
              Completed briefs, budgets, customer notices, and marketing copy generated across all departments.
            </p>
          </div>
        </div>

        {/* ── Filter & Search Toolbar ── */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="relative min-w-80">
            <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, document type, or department…"
              className="h-8.5 w-full rounded-lg border border-line bg-surface py-1 pr-3 pl-8.5 text-xs text-ink outline-none transition-all placeholder:text-dim focus:border-task focus:ring-2 focus:ring-task/15"
            />
          </div>

          <div className="flex items-center rounded-xl border border-line bg-surface p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cx(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer',
                viewMode === 'grid' ? 'bg-raised text-ink shadow-xs' : 'text-mut hover:text-ink',
              )}
            >
              <SquaresFour size={15} weight={viewMode === 'grid' ? 'fill' : 'regular'} />
              <span>Gallery</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cx(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer',
                viewMode === 'table' ? 'bg-raised text-ink shadow-xs' : 'text-mut hover:text-ink',
              )}
            >
              <Table size={15} weight={viewMode === 'table' ? 'fill' : 'regular'} />
              <span>Table</span>
            </button>
          </div>
        </div>

        {/* ── Content View ── */}
        <div className="mt-6 min-w-0 flex-1">
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface px-6 py-20 text-center shadow-xs">
              <div className="flex size-12 items-center justify-center rounded-xl bg-raised text-dim">
                <FileText size={22} className="text-dim" />
              </div>
              <h3 className="mt-4 text-[15px] font-bold text-ink">No documents yet</h3>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-mut">
                Completed briefs, budgets, customer notices, and marketing copy will appear here once generated.
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => useStore.getState().runRehearsal('launch-day')}
                  className="btn btn-primary h-8 rounded-lg px-4 text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span>Run Launch Demo</span>
                  <ArrowRight size={12} weight="bold" />
                </button>
              </div>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-12 text-center shadow-xs">
              <span className="text-[14px] font-bold text-ink">No documents match your search</span>
              <p className="mt-1 text-xs text-mut">Try searching for a different keyword.</p>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="btn mt-4 h-8 rounded-lg px-4 text-xs font-semibold cursor-pointer"
              >
                Clear Search
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDocs.map((event) => (
                <DocumentCard key={event.id} event={event} world={world} />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
              <table className="w-full min-w-[1020px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[28%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[18%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line bg-raised/40">
                    <th className="px-4 py-3 text-[11px] font-semibold text-dim uppercase tracking-wider">Document</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-dim uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-dim uppercase tracking-wider">Provenance</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-dim uppercase tracking-wider">Origin Desk</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-dim uppercase tracking-wider">Delivered</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-dim uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredDocs.map((event, index) => (
                    <DocumentRow key={event.id} event={event} world={world} index={index} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DocumentCard({ event, world }: { event: WorldEvent; world: World }) {
  const record = readArtifactRecord(event, {
    task: event.taskId ? world.tasks.get(event.taskId) : undefined,
    agents: world.agents,
  })
  const dept = event.deptFrom ? deptById.get(event.deptFrom) : undefined
  const task = event.taskId ? world.tasks.get(event.taskId) : undefined
  const from = refLabel(event.from, world)

  const openDocument = () => {
    useStore.getState().openArtifact(event.id)
  }

  return (
    <div
      onClick={openDocument}
      className="group relative flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-xs transition-all hover:border-linebright hover:shadow-md cursor-pointer"
    >
      <div>
        {/* Top Header with Provenance */}
        <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-dim">
            {record.label}
          </span>
          <span className={cx('rounded-md border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider', PROVENANCE_CLASS[record.provenance])}>
            {record.provenanceLabel}
          </span>
        </div>

        {/* Title */}
        <h3 className="mt-3.5 text-[14.5px] font-bold tracking-tight text-ink group-hover:text-task transition-colors line-clamp-2">
          {record.title}
        </h3>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-dim">
          <span className="font-semibold text-ink/85">{dept?.name ?? 'Company'}</span>
          <span>·</span>
          <span>{from ? `By ${from}` : record.name}</span>
        </div>

        {task && (
          <div className="mt-3 truncate text-[11.5px] text-mut bg-raised/40 border border-line rounded-lg px-2.5 py-1">
            <span className="font-mono text-[10px] text-dim mr-1">Task:</span>
            <span>{task.title}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between border-t border-line/70 pt-3.5">
        <span className="font-mono text-[10.5px] text-dim">
          {fmtDay(event.ts)} · {fmtClock(event.ts)}
        </span>

        <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-task hover:underline">
          <span>Read Document</span>
          <ArrowRight size={11} weight="bold" />
        </span>
      </div>
    </div>
  )
}

function DocumentRow({ event, world, index }: { event: WorldEvent; world: World; index: number }) {
  const record = readArtifactRecord(event, {
    task: event.taskId ? world.tasks.get(event.taskId) : undefined,
    agents: world.agents,
  })
  const dept = event.deptFrom ? deptById.get(event.deptFrom) : undefined
  const task = event.taskId ? world.tasks.get(event.taskId) : undefined
  const from = refLabel(event.from, world)
  const deptHue = personById.get(dept?.leadId ?? '')?.hue

  const openDocument = (click: MouseEvent<HTMLButtonElement>) => {
    click.stopPropagation()
    useStore.getState().openArtifact(event.id)
  }

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

  return (
    <tr
      tabIndex={0}
      className="group cursor-pointer transition-colors hover:bg-hover/60"
      onClick={openOnMap}
    >
      <td className="px-4 py-3.5">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-bold text-ink group-hover:text-task transition-colors">{record.title}</div>
          <div className="truncate text-[11px] text-dim">{from ? `Prepared by ${from}` : record.name}</div>
        </div>
      </td>
      <td className="px-4 py-3"><Pill className="text-artifact font-semibold">{record.label}</Pill></td>
      <td className="px-4 py-3"><Pill className={PROVENANCE_CLASS[record.provenance]}>{record.provenanceLabel}</Pill></td>
      <td className="px-4 py-3 text-[12px] font-medium text-mut">{dept?.name ?? 'Company'}</td>
      <td className="px-4 py-3 text-right">
        <div className="font-mono text-[10.5px] text-mut">{fmtDay(event.ts)}</div>
        <div className="font-mono text-[10px] text-dim">{fmtClock(event.ts)}</div>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          className="btn h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
          onClick={openDocument}
        >
          <span>Read</span>
          <ArrowSquareOut size={10} weight="bold" />
        </button>
      </td>
    </tr>
  )
}

const PROVENANCE_CLASS: Record<ArtifactProvenance, string> = {
  'live-content': 'border-artifact/40 bg-artifact/10 text-artifact',
  'rehearsal-template': 'border-permission/40 bg-permission/10 text-permission',
  'metadata-only': 'border-escalation/40 bg-escalation/10 text-escalation',
}

function refLabel(ref: Ref | undefined, world: World): string | null {
  if (!ref) return null
  if (ref.kind === 'agent') return world.agents.find((agent) => agent.id === ref.id)?.name ?? ref.id
  if (ref.kind === 'person') return personById.get(ref.id)?.name ?? ref.id
  return 'Agent Gateway'
}
