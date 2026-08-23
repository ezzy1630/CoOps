import { X } from '@phosphor-icons/react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store'
import { buildArtifactDoc } from '../data/artifactContent'
import type { ArtifactDoc, DocBlock } from '../data/artifactContent'
import { cx } from '../utils'

// Global document viewer for delivered artifacts. Opened from anywhere via
// useStore().openArtifact(eventId) where eventId is an ArtifactDelivered event
// id. Escape is handled globally in App; backdrop click and × close it here.
export default function ArtifactViewer() {
  const eventId = useStore((s) => s.artifactEventId)
  const log = useStore((s) => s.log)
  const world = useStore((s) => s.world)
  const close = useStore((s) => s.closeArtifact)

  const ev = eventId ? log.find((e) => e.id === eventId) : undefined
  const doc = ev
    ? buildArtifactDoc(ev, {
        task: ev.taskId ? world.tasks.get(ev.taskId) : undefined,
        agents: world.agents,
      })
    : undefined

  return createPortal(
    <AnimatePresence>
      {ev && doc && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/45 p-6"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ type: 'spring', stiffness: 480, damping: 38, mass: 0.9 }}
            className="relative max-h-[88vh] w-full max-w-[660px] border border-line bg-surface shadow-[0_1px_2px_rgb(23_22_15/0.06),0_24px_64px_rgb(23_22_15/0.2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 z-10 rounded-sm px-1 py-0.5 text-dim hover:bg-hover hover:text-ink"
              title="Close (Esc)"
              onClick={close}
            >
              <X size={15} />
            </button>

            <div className="max-h-[88vh] overflow-y-auto overscroll-contain px-12 py-10 max-sm:px-6">
              {/* ── letterhead ── */}
              <header>
                <div className="flex items-baseline justify-between gap-4 pr-8">
                  <div className="text-[11px] font-semibold tracking-[0.32em] text-ink uppercase">
                    Everpeak Outfitters
                  </div>
                  <div className="shrink-0 font-mono text-[10px] tracking-[0.14em] text-mut uppercase">
                    {doc.label}
                  </div>
                </div>
                <div className="mt-3 border-t border-linebright" />
                <h1 className="mt-5 text-[23px] leading-snug font-semibold tracking-[-0.015em] text-ink">{doc.title}</h1>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[10.5px] text-mut">
                  {doc.meta.map((m, i) => (
                    <span key={i} className="inline-flex items-baseline gap-2">
                      {i > 0 && <span className="text-dim">·</span>}
                      <span>{m}</span>
                    </span>
                  ))}
                </div>
              </header>

              <div className="mt-6 border-t border-line" />

              {/* ── body ── */}
              <div className="mt-6 space-y-5">
                {doc.blocks.map((b, i) => (
                  <Block key={i} block={b} />
                ))}
              </div>

              {/* ── footer ── */}
              <footer className="mt-10 border-t border-line pt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10.5px] text-dim">
                    Drafted autonomously · delivered to {doc.recipientDesk}
                  </span>
                  <button
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-sm border border-line px-2 py-1 font-mono text-[10.5px] text-mut transition-colors hover:border-linebright hover:bg-raised hover:text-ink"
                    onClick={() =>
                      useStore.getState().toast('Open in Drive', 'Demo build — the Drive copy is simulated.')
                    }
                  >
                    Open in Drive ↗
                  </button>
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

// ─── Typed blocks ────────────────────────────────────────────────────────────

function Block({ block: b }: { block: DocBlock }) {
  switch (b.kind) {
    case 'para':
      return <p className="text-[13.5px] leading-relaxed text-ink/90">{b.text}</p>

    case 'heading':
      return <h2 className="pt-1 font-mono text-[10px] tracking-[0.16em] text-mut uppercase">{b.text}</h2>

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
                <p className="text-[13.5px] leading-snug font-semibold text-ink">{it.q}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-mut">{it.a}</p>
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
                      “{it.claim}”
                    </span>
                  ) : (
                    <>“{it.claim}”</>
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
                <p className="mt-1.5 text-[13.5px] leading-snug text-artifact">→ “{it.replacement}”</p>
              )}
              <p className="mt-1.5 text-[11.5px] leading-snug text-mut italic">{it.note}</p>
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
                {it.text}
                {it.note && <span className="ml-1.5 font-mono text-[10.5px] text-dim">— {it.note}</span>}
              </span>
            </div>
          ))}
        </div>
      )

    case 'macro':
      return (
        <div className="border border-line">
          <div className="border-b border-line bg-raised/60 px-3.5 py-1.5 font-mono text-[10px] tracking-wider text-mut uppercase">
            {b.label}
          </div>
          <div className="px-4 py-3">
            {b.subject && (
              <p className="text-[13px] leading-snug text-ink">
                <span className="font-mono text-[10px] text-dim uppercase">Subject&nbsp;&nbsp;</span>
                <span className="font-semibold">{b.subject}</span>
              </p>
            )}
            <p className={cx('text-[13px] leading-relaxed whitespace-pre-line text-ink/90', b.subject && 'mt-2')}>
              {b.body}
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
          {b.text}
        </p>
      )

    case 'sign':
      return (
        <div className="pt-1">
          <p className="text-[13px] font-medium text-ink">{b.name}</p>
          <p className="mt-0.5 font-mono text-[10px] text-dim">{b.role}</p>
        </div>
      )
  }
}

function FieldRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div className="pt-[2px] font-mono text-[10px] tracking-wider text-dim uppercase">{k}</div>
      <div className="min-w-0 text-[13px] leading-snug text-ink">{v}</div>
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
                {col}
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
                  {cell}
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
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        )}
      </table>
      {b.note && <p className="mt-2 font-mono text-[10.5px] leading-snug text-dim">{b.note}</p>}
    </div>
  )
}
