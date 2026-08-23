import { X } from '@phosphor-icons/react'
import { useStore } from '../store'
import { personById } from '../data/company'
import { cx } from '../utils'
import { Chip, Pill } from './ui'

const MARKETING_HUE = personById.get('maya')?.hue ?? 330

/**
 * Configuration inheritance for one worker — the Summit Launch Agent.
 * Hand-authored: this is the demo's "inheritance diff on one worker", showing
 * how company baseline → department overrides → worker-local settings compose.
 */
export default function InheritanceDiff() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-3.5 w-0.5 shrink-0 rounded-full" style={{ background: `hsl(${MARKETING_HUE} 56% 52%)` }} />
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Configuration inheritance</h2>
          </div>
          <p className="truncate text-[12.5px] text-dim">Summit Launch Agent — Marketing / Everpeak baseline</p>
        </div>
        <div className="flex-1" />
        <button
          className="rounded-sm px-1.5 py-0.5 text-dim transition-colors hover:bg-hover hover:text-ink"
          title="Close"
          onClick={() => useStore.getState().closePanel()}
        >
          <X size={15} />
        </button>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-3 py-1.5">
        <LegendChip label="Company baseline" cls={BASELINE_TINT} />
        <LegendChip label="Marketing overrides" cls={DEPT_TINT} />
        <LegendChip label="Worker local" cls={LOCAL_TINT} />
        <span className="text-dim">·</span>
        <LegendChip label="denied" cls={DENIED_TINT} />
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

      <footer className="shrink-0 border-t border-line px-3 py-2 text-[12px] leading-relaxed text-mut">
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

/**
 * Layer tints for the shared Chip/Pill atoms. `!` where the tint would otherwise
 * lose to the atom's own base utility at equal specificity.
 */
const BASELINE_TINT = 'border-linebright bg-raised! text-dim!'
const DEPT_TINT = 'border-task/35 bg-task/6 text-task'
const LOCAL_TINT = 'border-artifact/35! bg-artifact/6! text-artifact!'
const DENIED_TINT = 'border-escalation/35! bg-escalation/6! text-escalation!'

const SOURCE_LABEL: Record<Layer, string> = { baseline: 'baseline', dept: 'dept', local: 'local' }
const SOURCE_CLS: Record<Layer, string> = {
  baseline: BASELINE_TINT,
  dept: DEPT_TINT,
  local: LOCAL_TINT,
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

function LockGlyph() {
  return (
    <svg viewBox="0 0 10 12" className="size-2.5 shrink-0" aria-hidden="true">
      <path d="M2.6 5.2V3.5a2.4 2.4 0 0 1 4.8 0v1.7" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.2" y="5.2" width="7.6" height="6" rx="1.3" fill="currentColor" />
    </svg>
  )
}

function SettingRow({ row }: { row: DiffRow }) {
  return (
    <div className="grid grid-cols-[142px_1fr_140px] items-start gap-3 border-b border-line/50 px-3 py-2 hover:bg-raised/50">
      <div className="text-[12.5px] leading-snug text-ink">{row.name}</div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[12.5px] leading-snug">
          {row.chain.map((v, i) => {
            const last = i === row.chain.length - 1
            return (
              <span key={i} className="flex items-baseline gap-1.5">
                {i > 0 && <span className="text-dim">→</span>}
                <span className={cx('tabular-nums', last ? VALUE_CLS[row.state] : 'text-dim line-through decoration-dim/50')}>{v}</span>
              </span>
            )
          })}
        </div>
        {row.note && <div className="mt-0.5 text-[11.5px] text-dim">{row.note}</div>}
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <Pill className={SOURCE_CLS[row.source]}>{SOURCE_LABEL[row.source]}</Pill>
        <span className={cx('flex items-center gap-1 text-[10.5px]', STATE_CLS[row.state])}>
          {row.state === 'denied' && <LockGlyph />}
          {row.state}
        </span>
      </div>
    </div>
  )
}

function LegendChip({ label, cls }: { label: string; cls: string }) {
  return <Chip className={cls}>{label}</Chip>
}
