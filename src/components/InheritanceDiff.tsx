import { X } from '@phosphor-icons/react'
import { useStore } from '../store'
import { deptById, personById, toolById } from '../data/company'
import type { AgentBlueprint } from '../types'
import { cx } from '../utils'
import { Chip, Pill } from './ui'

export default function InheritanceDiff() {
  const proposalEventId = useStore((state) => state.panel?.kind === 'diff' ? state.panel.id : undefined)
  const proposal = useStore((state) => proposalEventId
    ? state.log.find((event) => event.id === proposalEventId && event.type === 'BlueprintProposed')
    : undefined)
  const world = useStore((state) => state.world)
  const blueprint = proposal?.payload?.blueprint

  if (!blueprint) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader title="Configuration inheritance" subtitle="Blueprint unavailable" />
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[12.5px] text-dim">
          The blueprint event for this worker is not available in the current event log.
        </div>
      </div>
    )
  }

  const department = world.departments.get(blueprint.deptId) ?? deptById.get(blueprint.deptId)
  const owner = personById.get(blueprint.ownerId)
  const departmentLead = department ? personById.get(department.leadId) : undefined
  const hue = departmentLead?.hue ?? owner?.hue
  const sections = sectionsFor(blueprint, department?.name ?? blueprint.deptId)

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Configuration inheritance"
        subtitle={`${blueprint.name} · ${department?.name ?? blueprint.deptId} / Everpeak baseline`}
        hue={hue}
      />

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-3 py-1.5">
        <LegendChip label="Company baseline" cls={BASELINE_TINT} />
        <LegendChip label={department?.name ?? 'Department'} cls={DEPT_TINT} />
        <LegendChip label="Blueprint local" cls={LOCAL_TINT} />
        <span className="text-dim">·</span>
        <LegendChip label="constrained" cls={CONSTRAINED_TINT} />
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {sections.map((section) => (
          <section key={section.label}>
            <div className="sticky top-0 z-10 border-b border-line bg-surface/95 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-dim">
              {section.label}
            </div>
            {section.rows.map((row) => <SettingRow key={row.name} row={row} />)}
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

function PanelHeader({ title, subtitle }: { title: string; subtitle: string; hue?: number }) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4 bg-surface">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate text-[14.5px] font-bold tracking-tight text-ink">{title}</h2>
        <span className="hidden truncate text-[11.5px] text-dim md:inline">· {subtitle}</span>
      </div>
      <button
        className="flex size-7 items-center justify-center rounded-lg text-dim transition-colors hover:bg-hover hover:text-ink cursor-pointer"
        title="Close"
        onClick={() => useStore.getState().closePanel()}
      >
        <X size={15} />
      </button>
    </header>
  )
}

type Layer = 'baseline' | 'dept' | 'local'
type RowState = 'inherited' | 'configured' | 'constrained'

interface DiffRow {
  name: string
  chain: string[]
  source: Layer
  state: RowState
  note?: string
}

interface Section {
  label: string
  rows: DiffRow[]
}

function sectionsFor(blueprint: AgentBlueprint, departmentName: string): Section[] {
  const owner = personById.get(blueprint.ownerId)
  const tools = blueprint.toolIds.map((id) => toolById.get(id))

  return [
    {
      label: 'Security & guardrails',
      rows: [
        { name: 'Capability broadening', chain: ['named human approval required'], source: 'baseline', state: 'inherited' },
        { name: 'Audit logging', chain: ['full event log'], source: 'baseline', state: 'inherited' },
      ],
    },
    {
      label: 'Worker configuration',
      rows: [
        { name: 'Name', chain: [blueprint.name], source: 'local', state: 'configured' },
        { name: 'Department', chain: [departmentName], source: 'dept', state: 'inherited' },
        { name: 'Owner', chain: [owner?.name ?? blueprint.ownerId], source: 'local', state: 'configured' },
        { name: 'Purpose', chain: [blueprint.purpose], source: 'local', state: 'configured' },
        { name: 'Trigger', chain: [blueprint.trigger], source: 'local', state: 'configured' },
        {
          name: 'Skills',
          chain: [blueprint.skills.length > 0 ? blueprint.skills.join(' · ') : 'none declared'],
          source: 'local',
          state: 'configured',
        },
        {
          name: 'Collaborators',
          chain: [blueprint.collaborators.length > 0 ? blueprint.collaborators.join(' · ') : 'none declared'],
          source: 'local',
          state: 'configured',
        },
      ],
    },
    {
      label: 'Tools',
      rows: tools.length > 0
        ? tools.map((tool, index) => ({
            name: tool?.name ?? blueprint.toolIds[index],
            chain: ['denied by default', 'requested by blueprint'],
            source: 'local' as const,
            state: 'configured' as const,
            note: tool?.requiresAuth ? 'Account access still requires its named owner to connect.' : undefined,
          }))
        : [{ name: 'Tool access', chain: ['none requested'], source: 'local', state: 'constrained' }],
    },
    {
      label: 'Approvals',
      rows: blueprint.approvals.length > 0
        ? blueprint.approvals.map((approval, index) => ({
            name: `Approval ${index + 1}`,
            chain: [approval],
            source: 'local' as const,
            state: 'constrained' as const,
          }))
        : [{ name: 'Additional approvals', chain: ['none declared beyond baseline'], source: 'baseline', state: 'inherited' }],
    },
    {
      label: 'Limits',
      rows: blueprint.limits.length > 0
        ? blueprint.limits.map((limit, index) => ({
            name: `Limit ${index + 1}`,
            chain: [limit],
            source: 'local' as const,
            state: 'constrained' as const,
          }))
        : [{ name: 'Worker limits', chain: ['company and department defaults'], source: 'baseline', state: 'inherited' }],
    },
  ]
}

const BASELINE_TINT = 'border-linebright bg-raised! text-dim!'
const DEPT_TINT = 'border-task/35 bg-task/6 text-task'
const LOCAL_TINT = 'border-artifact/35! bg-artifact/6! text-artifact!'
const CONSTRAINED_TINT = 'border-escalation/35! bg-escalation/6! text-escalation!'

const SOURCE_LABEL: Record<Layer, string> = { baseline: 'baseline', dept: 'dept', local: 'blueprint' }
const SOURCE_CLS: Record<Layer, string> = { baseline: BASELINE_TINT, dept: DEPT_TINT, local: LOCAL_TINT }
const STATE_CLS: Record<RowState, string> = {
  inherited: 'text-dim',
  configured: 'text-artifact',
  constrained: 'text-escalation',
}
const VALUE_CLS: Record<RowState, string> = {
  inherited: 'text-mut',
  configured: 'text-artifact',
  constrained: 'text-escalation',
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
          {row.chain.map((value, index) => {
            const last = index === row.chain.length - 1
            return (
              <span key={index} className="flex items-baseline gap-1.5">
                {index > 0 && <span className="text-dim">→</span>}
                <span className={cx('tabular-nums', last ? VALUE_CLS[row.state] : 'text-dim line-through decoration-dim/50')}>
                  {value}
                </span>
              </span>
            )
          })}
        </div>
        {row.note && <div className="mt-0.5 text-[11.5px] text-dim">{row.note}</div>}
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <Pill className={SOURCE_CLS[row.source]}>{SOURCE_LABEL[row.source]}</Pill>
        <span className={cx('flex items-center gap-1 text-[10.5px]', STATE_CLS[row.state])}>
          {row.state === 'constrained' && <LockGlyph />}
          {row.state}
        </span>
      </div>
    </div>
  )
}

function LegendChip({ label, cls }: { label: string; cls: string }) {
  return <Chip className={cls}>{label}</Chip>
}
