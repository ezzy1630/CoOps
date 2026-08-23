import { ArrowCounterClockwise, Minus, Play, Plus, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { PANEL_WIDTH, useStore } from '../store'
import { deptById, personById } from '../data/company'
import { cx } from '../utils'
import { Chip } from './ui'
import type { Task } from '../types'

const ACTS = ['Interview', 'Fan-out', 'Unblock & deliver'] as const

/** Map-only chrome. The status bar keeps controls visible without floating over the map. */
export default function MapOverlays() {
  const heroStage = useStore((s) => s.heroStage)
  const selectedTaskId = useStore((s) => s.selectedTaskId)
  const replay = useStore((s) => s.replay)
  const world = useStore((s) => s.world)
  const panel = useStore((s) => s.panel)
  const log = useStore((s) => s.log)
  // the classic camera doesn't exist over the valley — its controls would be dead
  const mapStyle = useStore((s) => s.mapStyle)
  const executionMode = useStore((s) => s.executionMode)
  const launchPending = useStore((s) => s.chatPending['op-marketing'] === true)

  const task = selectedTaskId ? world.tasks.get(selectedTaskId) : null
  const heroTask = [...world.tasks.values()].find((candidate) => candidate.title.startsWith('Summit Series launch'))
  const panelW = panel ? PANEL_WIDTH[panel.kind] : 0
  const workingCount = [...world.agentStatus.values()].filter((status) => status === 'working').length
  const blockedCount = [...world.agentStatus.values()].filter((status) => status === 'blocked').length

  const heroUnblocked =
    !!heroTask &&
    log.some(
      (event) => event.taskId === heroTask.id && (event.type === 'AccountConnected' || event.type === 'ApprovalGranted'),
    )
  const act = heroStage === 'interview' || heroStage === 'blueprint' ? 1 : heroUnblocked ? 3 : 2
  const beat =
    act === 1
      ? 'Maya describes the outcome; the Marketing Agent drafts a blueprint to approve.'
      : act === 3
        ? 'QuickBooks connected. The run resumes from its checkpoint and delivers.'
        : !heroTask
          ? 'Blueprint approved. The Summit Launch Agent is spawning under Marketing.'
          : heroTask.blockedOn
            ? `Blocked. Only ${personById.get(heroTask.blockedOn.personId)?.name ?? 'one human'} can ${heroTask.blockedOn.what.charAt(0).toLowerCase() + heroTask.blockedOn.what.slice(1)}.`
            : 'Work fans out to Finance, Legal and Support, running in parallel.'

  return (
    <>
      <div
        className={cx(
          'absolute bottom-0 left-0 z-10 flex items-center border-t border-line bg-surface',
          mapStyle === 'fun' ? 'h-14 gap-4 px-4' : 'h-10 gap-3 px-3',
        )}
        style={{ right: panelW }}
        aria-label="Map status bar"
      >
        {mapStyle === 'fun' ? (
          <>
            <ValleyHealth working={workingCount} blocked={blockedCount} waiting={world.approvals.length} />
            <span className="h-7 w-px shrink-0 bg-line" aria-hidden />
            <ValleyRunNarrative heroStage={heroStage} act={act} beat={beat} />
            <div className="min-w-0 flex-1" />
            {!replay && (heroStage === 'idle' || (heroStage === 'done' && heroTask)) && (
              <DemoAction
                prominent
                heroStage={heroStage}
                heroTask={heroTask}
                act={act}
                beat={beat}
                executionMode={executionMode}
                launchPending={launchPending}
                onReplay={() => heroTask && useStore.getState().startReplay(heroTask.id)}
              />
            )}
          </>
        ) : (
          <>
            <Legend />
            <ZoomControls />
            <PulseSparkline />
            <div className="min-w-0 flex-1" />
            {!replay && (
              <DemoAction
                heroStage={heroStage}
                heroTask={heroTask}
                act={act}
                beat={beat}
                executionMode={executionMode}
                launchPending={launchPending}
                onReplay={() => heroTask && useStore.getState().startReplay(heroTask.id)}
              />
            )}
          </>
        )}
      </div>

      {task && !replay && (
        <div
          className={cx(
            'pointer-events-none absolute left-0 z-10 flex justify-center px-3 transition-[right] duration-300',
            mapStyle === 'fun' ? 'bottom-[68px]' : 'bottom-[52px]',
          )}
          style={{ right: panelW }}
        >
          <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-sm border border-line bg-surface px-3 py-2 shadow-[0_2px_8px_rgb(23_22_15/0.08)] anim-fadeup">
            <Chip
              className={cx(
                'shrink-0',
                task.status === 'done' && 'border-artifact/50! text-artifact!',
                (task.status === 'waiting_auth' || task.status === 'waiting_approval') && 'border-permission/50! text-permission!',
                task.status === 'running' && 'border-task/50! text-task!',
                task.status === 'failed' && 'border-escalation/50! text-escalation!',
              )}
            >
              {task.status.replace('_', ' ')}
            </Chip>
            <span className="max-w-56 truncate text-[13px] font-medium">{task.title}</span>
            <span className="flex items-center gap-1 text-[12px] text-mut">
              {task.path.map((dept, index) => (
                <span key={dept} className="flex items-center gap-1">
                  {index > 0 && <span className="text-dim">→</span>}
                  {deptById.get(dept)?.name ?? dept}
                </span>
              ))}
              {task.status === 'done' && <span className="text-artifact">→ done</span>}
            </span>
            {task.eventIds.length > 2 && (
              <button className="btn h-7 text-[12px]" onClick={() => useStore.getState().startReplay(task.id)}>
                <ArrowCounterClockwise size={11} weight="bold" />
                Replay
              </button>
            )}
            <button className="text-dim hover:text-ink" title="Exit focus" onClick={() => useStore.getState().selectTask(null)}>
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
    <div className="flex shrink-0 items-center gap-3" aria-label={`${working} agents working, ${blocked} blocked, ${waiting} ${approvalLabel} waiting`}>
      <span>
        <span className="block font-display text-[11px] font-semibold text-ink">Company activity</span>
        <span className="mt-0.5 flex items-center gap-2 text-[9.5px] text-dim">
          <span className="flex items-center gap-1"><i className="h-2.5 w-px bg-task" aria-hidden />{working} working</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-px bg-human" aria-hidden />{waiting} waiting</span>
          {blocked > 0 && <span className="flex items-center gap-1 text-escalation"><i className="h-2.5 w-px bg-escalation" aria-hidden />{blocked} blocked</span>}
        </span>
      </span>
    </div>
  )
}

function ValleyRunNarrative({
  heroStage,
  act,
  beat,
}: {
  heroStage: ReturnType<typeof useStore.getState>['heroStage']
  act: number
  beat: string
}) {
  const currentAct = heroStage === 'idle' ? 0 : act
  const title = heroStage === 'idle' ? 'Launch route ready' : heroStage === 'done' ? 'Launch delivered' : ACTS[act - 1]
  const detail = heroStage === 'idle'
    ? 'Follow a launch as work moves between departments and pauses for named people.'
    : beat

  return (
    <div className="flex min-w-0 max-w-[620px] items-center gap-3">
      <div className="hidden shrink-0 items-center gap-1.5 lg:flex" aria-label={currentAct === 0 ? 'Launch not started' : `Launch step ${currentAct} of ${ACTS.length}`}>
        {ACTS.map((label, index) => (
          <span
            key={label}
            className={cx('h-1 w-7', index + 1 <= currentAct ? 'bg-task' : 'bg-linebright')}
            title={label}
          />
        ))}
      </div>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-medium text-ink">{title}</span>
        <span className="block truncate text-[10px] text-dim">{detail}</span>
      </span>
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
    <div className="flex shrink-0 items-center gap-2 text-[10px] text-dim">
      {entries.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2 w-px" style={{ background: color }} />
          <span className="hidden lg:inline">{label}</span>
        </span>
      ))}
    </div>
  )
}

function ZoomControls() {
  return (
    <div className="flex shrink-0 items-center border-l border-line pl-2 text-[11px] text-mut" aria-label="Map zoom controls">
      <button className="flex size-6 items-center justify-center hover:bg-hover hover:text-ink" title="Zoom out" onClick={() => useStore.getState().requestCamera({ type: 'zoomBy', factor: 1 / 1.45 })}>
        <Minus size={12} weight="bold" />
      </button>
      <button className="flex h-6 min-w-9 items-center justify-center font-mono text-[10px] tabular-nums hover:bg-hover hover:text-ink" title="Fit the whole company" onClick={() => useStore.getState().requestCamera({ type: 'fit' })}>Fit</button>
      <button className="flex size-6 items-center justify-center hover:bg-hover hover:text-ink" title="Zoom in" onClick={() => useStore.getState().requestCamera({ type: 'zoomBy', factor: 1.45 })}>
        <Plus size={12} weight="bold" />
      </button>
    </div>
  )
}

function DemoAction({
  heroStage,
  heroTask,
  act,
  beat,
  executionMode,
  launchPending,
  prominent = false,
  onReplay,
}: {
  heroStage: ReturnType<typeof useStore.getState>['heroStage']
  heroTask: Task | undefined
  act: number
  beat: string
  executionMode: ReturnType<typeof useStore.getState>['executionMode']
  launchPending: boolean
  prominent?: boolean
  onReplay: () => void
}) {
  if (heroStage === 'idle') {
    return (
      <button
        className={cx(
          'flex shrink-0 items-center gap-1.5 px-3 text-[11px] font-medium disabled:cursor-wait disabled:text-dim',
          prominent ? 'btn btn-primary h-8' : 'h-6 border-l border-line text-ink hover:bg-hover',
        )}
        disabled={launchPending}
        onClick={() => useStore.getState().runHeroAuto()}
      >
        <Play size={11} weight="fill" />
        {launchPending
          ? 'Waiting for Marketing'
          : executionMode === 'live'
            ? 'Start live launch'
            : 'Run launch rehearsal'}
      </button>
    )
  }
  if (heroStage === 'done' && heroTask) {
    return (
      <button className={cx('flex shrink-0 items-center gap-1.5 px-3 text-[11px] font-medium', prominent ? 'btn h-8' : 'h-6 border-l border-line text-ink hover:bg-hover')} onClick={onReplay}>
        <ArrowCounterClockwise size={12} weight="bold" />
        Replay the launch
      </button>
    )
  }
  return (
    <div className="flex min-w-0 max-w-[520px] items-center gap-3" title={beat}>
      <div className="flex shrink-0 items-center gap-1.5 text-[10px]">
        {ACTS.map((label, index) => (
          <span key={label} className="flex items-center gap-1.5">
            {index > 0 && <span className="text-dim">→</span>}
            <span className={cx(index + 1 === act ? 'text-ink' : index + 1 < act ? 'text-mut' : 'text-dim')}>
              {label}
            </span>
          </span>
        ))}
      </div>
      <span className="h-4 w-px shrink-0 bg-line" aria-hidden />
      <span className="min-w-0 truncate text-[12px] text-mut">{beat}</span>
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
