import { useStore } from '../store'
import { cx } from '../utils'

/**
 * Configuration inheritance for one worker — the Summit Launch Agent.
 * Hand-authored: this is the demo's "inheritance diff on one worker", showing
 * how company baseline → department overrides → worker-local settings compose.
 */
export default function InheritanceDiff() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold">Configuration inheritance</h2>
          <p className="truncate text-[11px] text-dim">Summit Launch Agent — Marketing / Everpeak baseline</p>
        </div>
        <div className="flex-1" />
        <button
          className="rounded px-1.5 py-0.5 text-[13px] text-dim hover:bg-hover hover:text-ink"
          title="Close"
          onClick={() => useStore.getState().closePanel()}
        >
          ✕
        </button>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        <LegendChip label="Company baseline" cls="border-linebright bg-raised text-dim" />
        <LegendChip label="Marketing overrides" cls="border-task/45 bg-task/10 text-task" />
        <LegendChip label="Worker local" cls="border-artifact/45 bg-artifact/10 text-artifact" />
        <span className="text-dim">·</span>
        <LegendChip label="denied" cls="border-escalation/45 bg-escalation/10 text-escalation" />
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {SECTIONS.map((s) => (
          <section key={s.label}>
            <div className="sticky top-0 z-10 border-b border-line bg-surface/95 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-dim">
              {s.label}
            </div>
            {s.rows.map((r) => (
              <SettingRow key={r.name} row={r} />
            ))}
          </section>
        ))}
      </div>

      <footer className="shrink-0 border-t border-line px-3 py-2.5 text-[12px] leading-relaxed text-mut">
        Children can narrow inherited access but can never silently broaden it. Broadening always routes to a named
        human.
      </footer>
    </div>
  )
}

// ─── Model ───────────────────────────────────────────────────────────────────

type Layer = 'baseline' | 'dept' | 'local'
type RowState = 'inherited' | 'overridden' | 'narrowed' | 'denied'

interface DiffRow {
  name: string
  /** value chain: earlier entries are superseded, the last one is effective */
  chain: string[]
  source: Layer
  state: RowState
  note?: string
}

interface Section {
  label: string
  rows: DiffRow[]
}

const SECTIONS: Section[] = [
  {
    label: 'Security & guardrails',
    rows: [
      {
        name: 'Model Armor policy',
        chain: ['strict — prompt injection, tool poisoning, PII'],
        source: 'baseline',
        state: 'inherited',
      },
      { name: 'Audit logging', chain: ['full event log → Cloud Logging'], source: 'baseline', state: 'inherited' },
      { name: 'Agent identity', chain: ['workload identity, zero-trust peer auth'], source: 'baseline', state: 'inherited' },
    ],
  },
  {
    label: 'Model policy',
    rows: [
      { name: 'Reasoning model', chain: ['gemini-3.5-pro'], source: 'baseline', state: 'inherited' },
      {
        name: 'Drafting model',
        chain: ['gemini-3.5-pro', 'gemini-3.5-flash'],
        source: 'dept',
        state: 'overridden',
        note: 'Marketing runs high-volume drafts — cost',
      },
      { name: 'Temperature ceiling', chain: ['1.0', '0.6'], source: 'local', state: 'overridden' },
    ],
  },
  {
    label: 'Budget & limits',
    rows: [
      {
        name: 'Daily model budget',
        chain: ['$50', '$25'],
        source: 'local',
        state: 'narrowed',
        note: 'Set by Maya Chen at creation',
      },
      { name: 'Runtime limit', chain: ['30 min/run'], source: 'baseline', state: 'inherited' },
      { name: 'External sends', chain: ['allowed with approval', 'denied'], source: 'local', state: 'denied' },
    ],
  },
  {
    label: 'Memory scope',
    rows: [
      {
        name: 'Memory Bank scope',
        chain: ['company', 'marketing', 'launch-2026 partition'],
        source: 'local',
        state: 'narrowed',
        note: 'Narrowed twice — dept, then worker',
      },
      {
        name: 'Cross-dept sharing',
        chain: ['scoped context only, never full memory'],
        source: 'baseline',
        state: 'inherited',
      },
    ],
  },
  {
    label: 'Tools',
    rows: [
      { name: 'Google Drive', chain: ['granted'], source: 'dept', state: 'inherited' },
      { name: 'Google Sheets', chain: ['granted'], source: 'dept', state: 'inherited' },
      { name: 'QuickBooks', chain: ['not requested — denied by default'], source: 'baseline', state: 'denied' },
      {
        name: 'Payment initiation',
        chain: ['denied — cannot be broadened'],
        source: 'baseline',
        state: 'denied',
        note: 'Only Dana Whitfield can grant this, in person',
      },
    ],
  },
  {
    label: 'Approvals',
    rows: [
      {
        name: 'Artifact sign-off',
        chain: ['department lead', 'Maya Chen'],
        source: 'local',
        state: 'narrowed',
        note: 'Named on the blueprint — not a role, a person',
      },
      { name: 'Blueprint changes', chain: ['human approval required'], source: 'baseline', state: 'inherited' },
    ],
  },
]

// ─── Row ─────────────────────────────────────────────────────────────────────

/** chip base without a size/color, so per-use utilities never fight `.chip` */
const PILL = 'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium'

const SOURCE_LABEL: Record<Layer, string> = { baseline: 'baseline', dept: 'dept', local: 'local' }
const SOURCE_CLS: Record<Layer, string> = {
  baseline: 'border-linebright bg-raised text-dim',
  dept: 'border-task/45 bg-task/10 text-task',
  local: 'border-artifact/45 bg-artifact/10 text-artifact',
}
const STATE_CLS: Record<RowState, string> = {
  inherited: 'text-dim',
  overridden: 'text-task',
  narrowed: 'text-artifact',
  denied: 'text-escalation',
}
const VALUE_CLS: Record<RowState, string> = {
  inherited: 'text-mut',
  overridden: 'text-task',
  narrowed: 'text-artifact',
  denied: 'text-escalation line-through decoration-escalation/60',
}

function SettingRow({ row }: { row: DiffRow }) {
  return (
    <div className="grid grid-cols-[142px_1fr_140px] items-start gap-3 border-b border-line/50 px-3 py-2 hover:bg-raised/50">
      <div className="text-[12px] leading-snug text-ink">{row.name}</div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[12px] leading-snug">
          {row.chain.map((v, i) => {
            const last = i === row.chain.length - 1
            return (
              <span key={i} className="flex items-baseline gap-1.5">
                {i > 0 && <span className="text-dim">→</span>}
                <span className={cx(last ? VALUE_CLS[row.state] : 'text-dim line-through decoration-dim/50')}>{v}</span>
              </span>
            )
          })}
        </div>
        {row.note && <div className="mt-0.5 text-[11px] text-dim">{row.note}</div>}
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <span className={cx(PILL, 'font-mono text-[9px] tracking-wider uppercase', SOURCE_CLS[row.source])}>
          {SOURCE_LABEL[row.source]}
        </span>
        <span className={cx('text-[10px]', STATE_CLS[row.state])}>{row.state}</span>
      </div>
    </div>
  )
}

function LegendChip({ label, cls }: { label: string; cls: string }) {
  return <span className={cx(PILL, 'text-[10px]', cls)}>{label}</span>
}
