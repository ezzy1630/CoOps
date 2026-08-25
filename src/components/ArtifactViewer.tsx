import { ArrowSquareOut, FileDashed, X } from '@phosphor-icons/react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store'
import type { ArtifactDoc, DocBlock } from '../data/artifactContent'
import { readArtifactRecord, type ArtifactProvenance } from '../artifacts/model'
import { cx } from '../utils'

const cleanText = (text: string): string => text.replaceAll('—', ',').replaceAll('–', ' to ')

// Global document viewer for delivered artifacts. Opened from anywhere via
// useStore().openArtifact(eventId) where eventId is an ArtifactDelivered event
// id. Escape is handled globally in App; backdrop click and × close it here.
export default function ArtifactViewer() {
  const eventId = useStore((s) => s.artifactEventId)
  const log = useStore((s) => s.log)
  const world = useStore((s) => s.world)
  const close = useStore((s) => s.closeArtifact)

  const ev = eventId ? log.find((e) => e.id === eventId) : undefined
  const record = ev && ev.type === 'ArtifactDelivered'
    ? readArtifactRecord(ev, {
        task: ev.taskId ? world.tasks.get(ev.taskId) : undefined,
        agents: world.agents,
      })
    : undefined
  const doc = record?.document
  const meta = doc?.meta ?? (ev ? [
    ...(ev.taskId ? [ev.taskId] : []),
    new Date(ev.ts).toLocaleString(),
    ev.id,
  ] : [])

  return createPortal(
    <AnimatePresence>
      {ev && record && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6 backdrop-blur-sm"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ type: 'spring', stiffness: 480, damping: 38, mass: 0.9 }}
            className="relative max-h-[88vh] w-full max-w-[680px] overflow-hidden rounded-2xl border border-linebright bg-surface/98 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-4 right-4 z-10 flex size-7 cursor-pointer items-center justify-center rounded-full text-dim transition-colors hover:bg-hover hover:text-ink active:scale-95"
              title="Close (Esc)"
              onClick={close}
            >
              <X size={15} />
            </button>

            <div className="max-h-[88vh] overflow-y-auto overscroll-contain px-12 py-10 max-sm:px-6">
              {/* ── letterhead ── */}
              <header className="relative">
                <div className="flex items-baseline justify-between gap-4 pr-8">
                  <div className="text-[11px] font-bold tracking-[0.3em] text-ink uppercase">
                    Everpeak Outfitters
                  </div>
                  <div className="flex shrink-0 items-baseline gap-2">
                    <ProvenanceBadge provenance={record.provenance}>{record.provenanceLabel}</ProvenanceBadge>
                    <span className="font-mono text-[10px] tracking-[0.14em] text-mut uppercase">
                      {cleanText(record.label)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 border-t border-linebright" />
                <h1 className="mt-5 text-[22px] leading-snug font-bold tracking-tight text-ink">{cleanText(record.title)}</h1>
                <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 font-mono text-[10.5px] text-mut">
                  {meta.map((m, i) => (
                    <span key={i} className="inline-flex items-baseline gap-2">
                      {i > 0 && <span className="text-dim">·</span>}
                      <span>{cleanText(m)}</span>
                    </span>
                  ))}
                </div>
              </header>

              <div className="mt-6 border-t border-line" />

              <ProvenanceNotice provenance={record.provenance} detail={record.provenanceDetail} />

              <div className="mt-6 space-y-5">
                {doc
                  ? doc.blocks.map((b, i) => <Block key={i} block={b} />)
                  : <MetadataOnlyBody eventId={ev.id} taskId={ev.taskId} type={record.type} />}
              </div>

              <footer className="mt-10 border-t border-line pt-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10.5px] text-dim">Event ID: {record.eventId}</span>
                  {record.location ? (
                    <a
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-raised/60 px-2.5 py-1 font-mono text-[10.5px] text-mut transition-colors hover:border-linebright hover:bg-hover hover:text-ink"
                      href={record.location.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {record.location.label} <ArrowSquareOut size={11} weight="bold" />
                    </a>
                  ) : (
                    <span className="font-mono text-[10.5px] text-dim">No external link attached</span>
                  )}
                </div>
              </footer>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

const PROVENANCE_CLASS: Record<ArtifactProvenance, string> = {
  'live-content': 'border-artifact/45 bg-artifact/10 text-artifact shadow-xs',
  'rehearsal-template': 'border-permission/45 bg-permission/10 text-permission shadow-xs',
  'metadata-only': 'border-escalation/45 bg-escalation/10 text-escalation shadow-xs',
}

function ProvenanceBadge({ provenance, children }: { provenance: ArtifactProvenance; children: string }) {
  return (
    <span className={cx('rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider uppercase', PROVENANCE_CLASS[provenance])}>
      {children}
    </span>
  )
}

function ProvenanceNotice({ provenance, detail }: { provenance: ArtifactProvenance; detail: string }) {
  return (
    <div className={cx('mt-5 rounded-xl border-l-3 bg-raised/40 p-3.5', provenance === 'live-content' ? 'border-artifact bg-artifact/5' : provenance === 'rehearsal-template' ? 'border-permission bg-permission/5' : 'border-escalation bg-escalation/5')}>
      <div className="text-[11.5px] font-semibold text-ink">Document Source</div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-mut">{detail}</p>
    </div>
  )
}

function MetadataOnlyBody({ eventId, taskId, type }: { eventId: string; taskId?: string; type: string }) {
  return (
    <div className="flex items-start gap-4 border border-line bg-raised/35 px-4 py-5">
      <FileDashed size={22} className="mt-0.5 shrink-0 text-escalation" />
      <div>
        <h2 className="text-[14px] font-semibold text-ink">Readable content was not attached</h2>
        <p className="mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-mut">
          CoOps received a live delivery event, but the backend supplied metadata only. The viewer will not substitute rehearsal content.
        </p>
        <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-5 gap-y-1.5 font-mono text-[10.5px]">
          <dt className="text-dim">Type</dt><dd className="text-ink">{type}</dd>
          <dt className="text-dim">Task</dt><dd className="text-ink">{taskId ?? 'Unlinked'}</dd>
          <dt className="text-dim">Event</dt><dd className="text-ink">{eventId}</dd>
        </dl>
      </div>
    </div>
  )
}

// ─── Typed blocks ────────────────────────────────────────────────────────────

function Block({ block: b }: { block: DocBlock }) {
  switch (b.kind) {
    case 'para':
      return <p className="text-[13.5px] leading-relaxed text-ink/90">{cleanText(b.text)}</p>

    case 'heading':
      return <h2 className="pt-1 font-mono text-[10px] tracking-[0.16em] text-mut uppercase">{cleanText(b.text)}</h2>

    case 'fields':
      return (
        <div className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5">
          {b.rows.map((r) => (
            <FieldRow key={r.k} k={r.k} v={r.v} />
          ))}
        </div>
      )

    case 'table':
      return <TableBlock b={b} />

    case 'qa':
      return (
        <div className="space-y-4">
          {b.items.map((it, i) => (
            <div key={i} className="flex gap-3">
              <span className="w-5 shrink-0 pt-px font-mono text-[10px] text-dim tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] leading-snug font-semibold text-ink">{cleanText(it.q)}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-mut">{cleanText(it.a)}</p>
              </div>
            </div>
          ))}
        </div>
      )

    case 'claims':
      return (
        <div className="space-y-3">
          {b.items.map((it, i) => (
            <div
              key={i}
              className="border-l-2 py-0.5 pl-4"
              style={{
                borderColor:
                  it.verdict === 'redlined'
                    ? 'color-mix(in srgb, var(--color-escalation) 55%, transparent)'
                    : 'color-mix(in srgb, var(--color-artifact) 45%, transparent)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] leading-snug text-ink">
                  {it.verdict === 'redlined' ? (
                    <span className="text-escalation line-through decoration-escalation/70 decoration-[1.5px]">
                      “{cleanText(it.claim)}”
                    </span>
                  ) : (
                    <>“{cleanText(it.claim)}”</>
                  )}
                </p>
                <span
                  className={cx(
                    'shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9.5px] tracking-wider',
                    it.verdict === 'redlined'
                      ? 'border-escalation/40 bg-escalation/8 text-escalation'
                      : 'border-artifact/40 bg-artifact/8 text-artifact',
                  )}
                >
                  {it.verdict === 'redlined' ? 'REDLINED' : 'CLEARED'}
                </span>
              </div>
              {it.replacement && (
                <p className="mt-1.5 text-[13.5px] leading-snug text-artifact">→ “{cleanText(it.replacement)}”</p>
              )}
              <p className="mt-1.5 text-[11.5px] leading-snug text-mut italic">{cleanText(it.note)}</p>
            </div>
          ))}
        </div>
      )

    case 'checklist':
      return (
        <div className="space-y-1.5">
          {b.items.map((it, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="mt-[3px] flex size-3.5 shrink-0 items-center justify-center border border-linebright">
                {it.done && (
                  <svg viewBox="0 0 10 10" className="size-2.5 text-artifact" aria-hidden="true">
                    <path d="M1.8 5.4 4 7.6 8.4 2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 text-[13.5px] leading-snug text-ink">
                {cleanText(it.text)}
                {it.note && <span className="ml-1.5 font-mono text-[10.5px] text-dim">· {cleanText(it.note)}</span>}
              </span>
            </div>
          ))}
        </div>
      )

    case 'macro':
      return (
        <div className="border border-line">
          <div className="border-b border-line bg-raised/60 px-3.5 py-1.5 font-mono text-[10px] tracking-wider text-mut uppercase">
            {cleanText(b.label)}
          </div>
          <div className="px-4 py-3">
            {b.subject && (
              <p className="text-[13px] leading-snug text-ink">
                <span className="font-mono text-[10px] text-dim uppercase">Subject&nbsp;&nbsp;</span>
                <span className="font-semibold">{cleanText(b.subject)}</span>
              </p>
            )}
            <p className={cx('text-[13px] leading-relaxed whitespace-pre-line text-ink/90', b.subject && 'mt-2')}>
              {cleanText(b.body)}
            </p>
          </div>
        </div>
      )

    case 'note':
      return (
        <p
          className="border-l-2 pl-3 text-[12px] leading-snug text-mut"
          style={{
            borderColor: `color-mix(in srgb, var(${
              b.tone === 'guard' ? '--color-guard' : '--color-human'
            }) 60%, transparent)`,
          }}
        >
          {cleanText(b.text)}
        </p>
      )

    case 'sign':
      return (
        <div className="pt-1">
          <p className="text-[13px] font-medium text-ink">{cleanText(b.name)}</p>
          <p className="mt-0.5 font-mono text-[10px] text-dim">{cleanText(b.role)}</p>
        </div>
      )
  }
}

function FieldRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div className="pt-[2px] font-mono text-[10px] tracking-wider text-dim uppercase">{cleanText(k)}</div>
      <div className="min-w-0 text-[13px] leading-snug text-ink">{cleanText(v)}</div>
    </>
  )
}

function TableBlock({ b }: { b: Extract<ArtifactDoc['blocks'][number], { kind: 'table' }> }) {
  const alignCls = (i: number) => (b.align[i] === 'r' ? 'text-right' : 'text-left')
  const cellCls = (i: number) =>
    b.align[i] === 'r' ? 'text-right font-mono text-[12.5px] tabular-nums' : 'text-left'
  return (
    <div>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {b.columns.map((col, i) => (
              <th
                key={i}
                className={cx(
                  'border-b border-linebright pb-1.5 font-mono text-[10px] font-medium tracking-wider text-dim uppercase',
                  alignCls(i),
                  i > 0 && 'pl-4',
                )}
              >
                {cleanText(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={cx('border-b border-line/70 py-1.5 text-ink', cellCls(ci), ci > 0 && 'pl-4')}
                >
                  {cleanText(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {b.footRows && b.footRows.length > 0 && (
          <tfoot>
            {b.footRows.map((fr, fi) => (
              <tr key={fi}>
                {fr.cells.map((cell, ci) => (
                  <td
                    key={ci}
                    className={cx(
                      'py-1.5',
                      cellCls(ci),
                      ci > 0 && 'pl-4',
                      fr.strong ? 'border-t border-linebright font-semibold text-ink' : 'text-mut',
                    )}
                  >
                    {cleanText(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        )}
      </table>
      {b.note && <p className="mt-2 font-mono text-[10.5px] leading-snug text-dim">{cleanText(b.note)}</p>}
    </div>
  )
}
