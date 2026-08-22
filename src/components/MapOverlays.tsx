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

  const task = selectedTaskId ? world.tasks.get(selectedTaskId) : null
  const heroTask = [...world.tasks.values()].find((candidate) => candidate.title.startsWith('Summit Series launch'))
  const panelW = panel ? PANEL_WIDTH[panel.kind] : 0

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
        className="absolute bottom-0 left-0 z-10 flex h-10 items-center gap-3 border-t border-line bg-surface px-3"
        style={{ right: panelW }}
        aria-label="Map status bar"
      >
        <Legend />
        {mapStyle === 'classic' && <ZoomControls />}
        <PulseSparkline />
        <div className="min-w-0 flex-1" />
        {!replay && (
          <DemoAction heroStage={heroStage} heroTask={heroTask} act={act} beat={beat} onReplay={() => heroTask && useStore.getState().startReplay(heroTask.id)} />
        )}
      </div>

      {task && !replay && (
        <div
          className="pointer-events-none absolute bottom-[52px] left-0 z-10 flex justify-center px-3 transition-[right] duration-300"
          style={{ right: panelW }}
        >
          <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 shadow-[0_2px_8px_rgb(23_22_15/0.08)] anim-fadeup">
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
            <span className="flex items-center gap-1 text-[11px] text-mut">
              {task.path.map((dept, index) => (
                <span key={dept} className="flex items-center gap-1">
                  {index > 0 && <span className="text-dim">→</span>}
                  {deptById.get(dept)?.name ?? dept}
                </span>
              ))}
              {task.status === 'done' && <span className="text-artifact">→ done</span>}
            </span>
            {task.eventIds.length > 2 && (
              <button className="btn h-7 text-[11px]" onClick={() => useStore.getState().startReplay(task.id)}>
                ↺ Replay
              </button>
            )}
            <button className="text-[12px] text-dim hover:text-ink" title="Exit focus" onClick={() => useStore.getState().selectTask(null)}>
              ✕
            </button>
          </div>
        </div>
      )}
    </>
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
    <div className="flex shrink-0 items-center gap-2 text-[9px] text-dim">
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
    <div className="flex shrink-0 items-center border-l border-line pl-2 text-[10px] text-mut" aria-label="Map zoom controls">
      <button className="flex size-6 items-center justify-center hover:bg-hover hover:text-ink" title="Zoom out" onClick={() => useStore.getState().requestCamera({ type: 'zoomBy', factor: 1 / 1.45 })}>
        −
      </button>
      <button className="flex h-6 min-w-9 items-center justify-center font-mono text-[9px] tabular-nums hover:bg-hover hover:text-ink" title="Fit the whole company" onClick={() => useStore.getState().requestCamera({ type: 'fit' })}>Fit</button>
      <button className="flex size-6 items-center justify-center hover:bg-hover hover:text-ink" title="Zoom in" onClick={() => useStore.getState().requestCamera({ type: 'zoomBy', factor: 1.45 })}>
        +
      </button>
    </div>
  )
}

function DemoAction({
  heroStage,
  heroTask,
  act,
  beat,
  onReplay,
}: {
  heroStage: ReturnType<typeof useStore.getState>['heroStage']
  heroTask: Task | undefined
  act: number
  beat: string
  onReplay: () => void
}) {
  if (heroStage === 'idle') {
    return (
      <button className="h-6 shrink-0 border-l border-line px-3 text-[10px] font-medium text-ink hover:bg-hover" onClick={() => useStore.getState().runHeroAuto()}>
        <PlayIcon />
        Run the launch demo
      </button>
    )
  }
  if (heroStage === 'done' && heroTask) {
    return (
      <button className="h-6 shrink-0 border-l border-line px-3 text-[10px] font-medium text-ink hover:bg-hover" onClick={onReplay}>
        <ReplayIcon />
        Replay the launch
      </button>
    )
  }
  return (
    <div className="flex min-w-0 max-w-[520px] items-center gap-3" title={beat}>
      <div className="flex shrink-0 items-center gap-1.5 text-[9px]">
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
      <span className="min-w-0 truncate text-[11px] text-mut">{beat}</span>
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

  if (quiet) return <span className="shrink-0 font-mono text-[10px] tabular-nums text-dim">0 ev/min</span>
  return (
    <div className="flex shrink-0 items-center gap-2" title="Company activity — events per minute, trailing 12 min">
      <svg width="64" height="16" viewBox="0 0 64 16" aria-hidden>
        {bars.map((bar, index) => (
          <rect key={index} x={bar.x} y={bar.y} width="4.4" height={bar.height} fill="var(--color-task)" fillOpacity={bar.opacity} />
        ))}
      </svg>
      <span className="font-mono text-[10px] tabular-nums text-dim">{perMin} ev/min</span>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="m3 2 7 4-7 4V2Z" />
    </svg>
  )
}

function ReplayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M3 6.5A5 5 0 1 1 4.8 11" strokeLinecap="round" />
      <path d="M3 3.5v3h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
