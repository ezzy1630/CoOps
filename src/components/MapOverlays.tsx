import { ArrowCounterClockwise, CaretDown, Minus, Play, Plus, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { PANEL_WIDTH, useStore } from '../store'
import { deptById } from '../data/company'
import { getRehearsal, presentRehearsal, rehearsals } from '../engine/rehearsals'
import type { RehearsalDefinition, RehearsalPresentation } from '../engine/rehearsals'
import { cx } from '../utils'
import { Chip } from './ui'

/** Map-only chrome. The status bar keeps controls visible with an ultra-sleek floating HUD dock. */
export default function MapOverlays() {
  const selectedTaskId = useStore((s) => s.selectedTaskId)
  const replay = useStore((s) => s.replay)
  const world = useStore((s) => s.world)
  const panel = useStore((s) => s.panel)
  const log = useStore((s) => s.log)
  const scheduled = useStore((s) => s.scheduled)
  const mapStyle = useStore((s) => s.mapStyle)
  const executionMode = useStore((s) => s.executionMode)
  const [selectedRehearsalId, setSelectedRehearsalId] = useState(() => getRehearsal()?.id ?? '')

  const task = selectedTaskId ? world.tasks.get(selectedTaskId) : null
  const panelW = panel ? PANEL_WIDTH[panel.kind] : 0
  const workingCount = [...world.agentStatus.values()].filter((status) => status === 'working').length
  const blockedCount = [...world.agentStatus.values()].filter((status) => status === 'blocked').length
  const presentations = useMemo(
    () => rehearsals.map((definition) => ({
      definition,
      presentation: presentRehearsal(definition, { log, scheduled, world }),
    })),
    [log, scheduled, world],
  )
  const selectedRehearsal =
    presentations.find(({ presentation }) => presentation.state === 'active') ??
    presentations.find(({ definition }) => definition.id === selectedRehearsalId) ??
    presentations[0]

  return (
    <>
      {/* Floating HUD Island Dock */}
      <div
        className="pointer-events-none absolute bottom-3 left-0 z-20 flex justify-center px-4 transition-[right] duration-300"
        style={{ right: panelW }}
        aria-label="Map status bar"
      >
        <div className="pointer-events-auto flex max-w-full items-center justify-between gap-3 rounded-full border border-line/80 bg-surface/90 px-3 py-1.5 backdrop-blur-md shadow-xl transition-all">
          {mapStyle === 'fun' ? (
            <>
              <div className="flex min-w-0 items-center gap-2.5">
                <ValleyHealth working={workingCount} blocked={blockedCount} waiting={world.approvals.length} />
                <ValleyRunNarrative
                  definition={selectedRehearsal?.definition}
                  presentation={selectedRehearsal?.presentation}
                  executionMode={executionMode}
                />
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <ZoomButtons
                  onZoomBy={(factor) => useStore.getState().requestCamera({ type: 'zoomBy', factor })}
                  onFit={() => useStore.getState().requestCamera({ type: 'fit' })}
                  fitTitle="Fit the whole valley"
                />
                {!replay && rehearsals.length > 1 && selectedRehearsal?.presentation.state !== 'active' && (
                  <RehearsalPicker
                    selectedId={selectedRehearsal?.definition.id ?? ''}
                    executionMode={executionMode}
                    disabled={selectedRehearsal?.presentation.state !== 'idle'}
                    onChange={setSelectedRehearsalId}
                  />
                )}
                {!replay && selectedRehearsal && selectedRehearsal.presentation.state !== 'active' && (
                  <RehearsalAction
                    prominent
                    definition={selectedRehearsal.definition}
                    presentation={selectedRehearsal.presentation}
                    executionMode={executionMode}
                  />
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-2.5">
                <Legend />
                <PulseSparkline />
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <ZoomButtons
                  onZoomBy={(factor) => useStore.getState().requestCamera({ type: 'zoomBy', factor })}
                  onFit={() => useStore.getState().requestCamera({ type: 'fit' })}
                  fitTitle="Fit the whole company"
                />
                {!replay && rehearsals.length > 1 && (
                  <RehearsalPicker
                    selectedId={selectedRehearsal?.definition.id ?? ''}
                    executionMode={executionMode}
                    disabled={selectedRehearsal?.presentation.state === 'active'}
                    onChange={setSelectedRehearsalId}
                  />
                )}
                {!replay && selectedRehearsal && (
                  <RehearsalAction
                    definition={selectedRehearsal.definition}
                    presentation={selectedRehearsal.presentation}
                    executionMode={executionMode}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {task && !replay && (
        <div
          className="pointer-events-none absolute bottom-[62px] left-0 z-20 flex justify-center px-3 transition-[right] duration-300"
          style={{ right: panelW }}
        >
          <div className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-linebright bg-surface/95 px-3.5 py-1.5 shadow-2xl backdrop-blur-md anim-fadeup">
            <Chip
              className={cx(
                'shrink-0 rounded-full font-mono text-[10.5px] uppercase tracking-wider',
                task.status === 'done' && 'border-artifact/50! text-artifact! bg-artifact/10!',
                (task.status === 'waiting_auth' || task.status === 'waiting_approval') && 'border-permission/50! text-permission! bg-permission/10!',
                task.status === 'running' && 'border-task/50! text-task! bg-task/10!',
                task.status === 'failed' && 'border-escalation/50! text-escalation! bg-escalation/10!',
              )}
            >
              {task.status.replace('_', ' ')}
            </Chip>
            <span className="max-w-64 truncate text-[12.5px] font-semibold text-ink">{task.title}</span>
            <span className="flex items-center gap-1.5 text-[11.5px] text-mut">
              {task.path.map((dept, index) => (
                <span key={dept} className="flex items-center gap-1.5">
                  {index > 0 && <span className="text-dim text-[10px]">→</span>}
                  <span className="font-medium text-ink/80">{deptById.get(dept)?.name ?? dept}</span>
                </span>
              ))}
              {task.status === 'done' && <span className="font-semibold text-artifact">→ done</span>}
            </span>
            {task.eventIds.length > 2 && (
              <button
                className="flex h-6 cursor-pointer items-center gap-1 rounded-full border border-line bg-raised px-2.5 text-[11px] font-medium text-ink transition-all hover:bg-hover hover:border-linebright"
                onClick={() => useStore.getState().startReplay(task.id)}
              >
                <ArrowCounterClockwise size={11} weight="bold" />
                <span>Replay</span>
              </button>
            )}
            <button
              className="cursor-pointer rounded-full p-1 text-dim transition-colors hover:bg-hover hover:text-ink"
              title="Exit focus"
              onClick={() => useStore.getState().selectTask(null)}
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function ValleyHealth({ working, blocked, waiting }: { working: number; blocked: number; waiting: number }) {
  const approvalLabel = waiting === 1 ? 'approval' : 'approvals'
  return (
    <div
      className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-raised/70 px-3 py-1 text-[11.5px] shadow-xs"
      aria-label={`${working} agents working, ${blocked} blocked, ${waiting} ${approvalLabel} waiting`}
    >
      <span className="flex items-center gap-1.5 font-semibold text-ink">
        <span className="relative flex size-2 items-center justify-center">
          {working > 0 && <span className="absolute inline-flex size-full rounded-full bg-task opacity-75 beacon-pulse" />}
          <span className={cx('size-1.5 rounded-full bg-task', working > 0 && 'shadow-[0_0_6px_rgba(37,99,235,0.6)]')} />
        </span>
        <span className="tabular-nums">{working} working</span>
      </span>
      <span className="text-linebright">·</span>
      <span className="flex items-center gap-1.5 text-mut font-medium">
        <span className={cx('size-1.5 rounded-full bg-human', waiting > 0 && 'shadow-[0_0_6px_rgba(217,119,6,0.5)]')} />
        <span className="tabular-nums">{waiting} waiting</span>
      </span>
      {blocked > 0 && (
        <>
          <span className="text-linebright">·</span>
          <span className="flex items-center gap-1.5 font-semibold text-escalation">
            <span className="size-1.5 rounded-full bg-escalation shadow-[0_0_6px_rgba(220,38,38,0.6)]" />
            <span className="tabular-nums">{blocked} blocked</span>
          </span>
        </>
      )}
    </div>
  )
}

function ValleyRunNarrative({
  definition,
  presentation,
}: {
  definition?: RehearsalDefinition
  presentation?: RehearsalPresentation
  executionMode: ReturnType<typeof useStore.getState>['executionMode']
}) {
  if (!definition || !presentation || presentation.state === 'idle') {
    // When idle, do not duplicate the button title in the center of the bar
    return null
  }

  const steps = presentation.steps ?? []
  const current = presentation.state === 'complete'
    ? steps.length
    : Math.max(1, Math.min(presentation.current ?? 1, Math.max(steps.length, 1)))
  const title = presentation.state === 'complete'
    ? 'Rehearsal complete'
    : steps[current - 1] ?? 'Rehearsal running'

  return (
    <div className="hidden min-w-0 max-w-[480px] items-center gap-2.5 rounded-full border border-line/80 bg-raised/70 px-3 py-1 shadow-xs lg:flex">
      {steps.length > 0 && (
        <div
          className="flex shrink-0 items-center gap-1"
          aria-label={`Rehearsal step ${current} of ${steps.length}`}
        >
          {steps.map((label, index) => (
            <span
              key={label}
              className={cx(
                'h-1.5 rounded-full transition-all duration-300',
                index + 1 === current
                  ? 'w-5 bg-task shadow-[0_0_6px_rgba(37,99,235,0.6)]'
                  : index + 1 < current
                    ? 'w-3 bg-task/60'
                    : 'w-3 bg-linebright',
              )}
              title={label}
            />
          ))}
        </div>
      )}
      <span className="min-w-0 truncate text-[11.5px] text-mut">
        <span className="font-semibold text-ink">{title}</span>
      </span>
    </div>
  )
}

function RehearsalPicker({
  selectedId,
  executionMode,
  disabled,
  onChange,
}: {
  selectedId: string
  executionMode: ReturnType<typeof useStore.getState>['executionMode']
  disabled: boolean
  onChange: (id: string) => void
}) {
  return (
    <div className="relative flex shrink-0 items-center">
      <select
        aria-label="Choose scenario"
        value={selectedId}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-7 cursor-pointer appearance-none rounded-full border border-line bg-surface py-0 pr-7 pl-3 text-[11.5px] font-medium text-mut shadow-xs outline-none transition-all hover:border-linebright hover:bg-hover hover:text-ink disabled:opacity-50"
      >
        {rehearsals.map((definition) => (
          <option key={definition.id} value={definition.id}>
            {definition.command[executionMode].title.replace(/^Run (the )?/, '').replace(/ rehearsal$/, '')}
          </option>
        ))}
      </select>
      <CaretDown size={10} className="pointer-events-none absolute right-2.5 text-dim" />
    </div>
  )
}

function Legend() {
  const entries = [
    ['var(--color-task)', 'Task'],
    ['var(--color-artifact)', 'Artifact'],
    ['var(--color-permission)', 'Human'],
    ['var(--color-escalation)', 'Escalation'],
    ['var(--color-guard)', 'Guardrail'],
  ] as const

  return (
    <div className="flex shrink-0 items-center gap-3 rounded-full border border-line bg-raised/70 px-3 py-1 text-[11px] text-dim shadow-xs">
      {entries.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="size-2 rounded-full" style={{ background: color }} />
          <span className="hidden lg:inline font-medium">{label}</span>
        </span>
      ))}
    </div>
  )
}

/** Zoom cluster shared by both maps; each view wires it to its own camera. */
function ZoomButtons({
  onZoomBy,
  onFit,
  fitTitle,
}: {
  onZoomBy: (factor: number) => void
  onFit: () => void
  fitTitle: string
}) {
  return (
    <div className="flex shrink-0 items-center rounded-full border border-line bg-raised/70 p-0.5 text-[11px] shadow-xs" aria-label="Map zoom controls">
      <button
        type="button"
        className="flex size-6 cursor-pointer items-center justify-center rounded-full text-dim transition-all hover:bg-surface hover:text-ink hover:shadow-xs active:scale-95"
        title="Zoom out (or pinch the trackpad)"
        onClick={() => onZoomBy(1 / 1.45)}
      >
        <Minus size={11} weight="bold" />
      </button>
      <button
        type="button"
        className="flex h-6 min-w-8 cursor-pointer items-center justify-center rounded-full font-mono text-[10.5px] font-medium tabular-nums text-mut transition-all hover:bg-surface hover:text-ink hover:shadow-xs active:scale-95"
        title={fitTitle}
        onClick={onFit}
      >
        Fit
      </button>
      <button
        type="button"
        className="flex size-6 cursor-pointer items-center justify-center rounded-full text-dim transition-all hover:bg-surface hover:text-ink hover:shadow-xs active:scale-95"
        title="Zoom in (or pinch the trackpad)"
        onClick={() => onZoomBy(1.45)}
      >
        <Plus size={11} weight="bold" />
      </button>
    </div>
  )
}

function RehearsalAction({
  definition,
  presentation,
  executionMode,
}: {
  definition: RehearsalDefinition
  presentation: RehearsalPresentation
  executionMode: ReturnType<typeof useStore.getState>['executionMode']
  prominent?: boolean
}) {
  if (presentation.state === 'idle') {
    return (
      <button
        className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-ink px-3.5 text-[11.5px] font-semibold text-bg shadow-sm transition-all hover:bg-ink/85 hover:shadow-md active:scale-[0.97] disabled:cursor-wait disabled:opacity-40"
        aria-label={definition.command[executionMode].title}
        title={definition.command[executionMode].description}
        onClick={() => useStore.getState().runRehearsal(definition.id)}
      >
        <Play size={10} weight="fill" />
        <span>Start demo</span>
      </button>
    )
  }
  if (presentation.state === 'complete') {
    return (
      <button
        className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[11.5px] font-semibold text-ink shadow-xs transition-all hover:border-linebright hover:bg-hover active:scale-[0.97]"
        aria-label="Restart demo"
        title="Clear this rehearsal and start it again from the beginning"
        onClick={() => useStore.getState().openRehearsal(definition.id)}
      >
        <ArrowCounterClockwise size={11} weight="bold" />
        <span>Restart demo</span>
      </button>
    )
  }

  const steps = presentation.steps ?? []
  const current = Math.max(1, Math.min(presentation.current ?? 1, Math.max(steps.length, 1)))
  return (
    <div className="flex min-w-0 max-w-[520px] items-center gap-3" title={presentation.detail}>
      {steps.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 text-[10px]">
          {steps.map((label, index) => (
            <span key={label} className="flex items-center gap-1.5">
              {index > 0 && <span className="text-dim">→</span>}
              <span className={cx(index + 1 === current ? 'text-ink font-semibold' : index + 1 < current ? 'text-mut' : 'text-dim')}>
                {label}
              </span>
            </span>
          ))}
        </div>
      )}
      {steps.length > 0 && presentation.detail && <span className="h-4 w-px shrink-0 bg-line" aria-hidden />}
      {presentation.detail && <span className="min-w-0 truncate text-[11.5px] font-medium text-mut">{presentation.detail}</span>}
    </div>
  )
}

/** Quiet events-per-minute pulse, based on the trailing twelve minutes. */
function PulseSparkline() {
  const logLen = useStore((s) => s.log.length)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 15_000)
    return () => clearInterval(timer)
  }, [])

  const { bars, perMin, quiet } = useMemo(() => {
    const log = useStore.getState().log
    const now = Date.now()
    const buckets = new Array<number>(12).fill(0)
    let perMin = 0
    for (let index = log.length - 1; index >= 0; index -= 1) {
      const age = now - log[index].ts
      if (age < 0) continue
      if (age >= 12 * 60_000) break
      buckets[11 - Math.floor(age / 60_000)] += 1
      if (age < 60_000) perMin += 1
    }
    const max = Math.max(1, ...buckets)
    const bars = buckets.map((value, index) => {
      const height = value === 0 ? 1 : Math.max(2, (value / max) * 13)
      return { x: index * 5.4, y: 16 - height, height, opacity: value === 0 ? 0.2 : 0.45 }
    })
    return { bars, perMin, quiet: perMin < 1 && buckets.every((value) => value <= 1) }
  }, [logLen, tick])

  if (quiet) return <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-dim">0 ev/min</span>
  return (
    <div className="flex shrink-0 items-center gap-2" title="Company activity: events per minute, trailing 12 min">
      <svg width="64" height="16" viewBox="0 0 64 16" aria-hidden>
        {bars.map((bar, index) => (
          <rect key={index} x={bar.x} y={bar.y} width="4.4" height={bar.height} fill="var(--color-task)" fillOpacity={bar.opacity} />
        ))}
      </svg>
      <span className="font-mono text-[10.5px] tabular-nums text-dim">{perMin} ev/min</span>
    </div>
  )
}
