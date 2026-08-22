import { PANEL_WIDTH, useStore } from '../store'
import { deptById, personById } from '../data/company'
import { cx } from '../utils'
import { Chip } from './ui'

const ACTS = ['Interview', 'Fan-out', 'Unblock & deliver'] as const

/** Legend, zoom controls, the one-click demo trigger, and the task-focus breadcrumb. */
export default function MapOverlays() {
  const heroStage = useStore((s) => s.heroStage)
  const selectedTaskId = useStore((s) => s.selectedTaskId)
  const replay = useStore((s) => s.replay)
  const world = useStore((s) => s.world)
  const panel = useStore((s) => s.panel)
  const log = useStore((s) => s.log)

  const task = selectedTaskId ? world.tasks.get(selectedTaskId) : null

  const heroTask = [...world.tasks.values()].find((t) => t.title.startsWith('Summit Series launch'))
  // centre bottom chrome on the map still visible beside an open panel
  const panelW = panel ? PANEL_WIDTH[panel.kind] : 0

  // which act of the launch demo is on stage — derived, no extra store state
  const heroUnblocked =
    !!heroTask &&
    log.some(
      (e) => e.taskId === heroTask.id && (e.type === 'AccountConnected' || e.type === 'ApprovalGranted'),
    )
  const act = heroStage === 'interview' || heroStage === 'blueprint' ? 1 : heroUnblocked ? 3 : 2
  const beat =
    act === 1
      ? 'Maya describes the outcome; the Marketing Agent drafts a blueprint to approve.'
      : act === 3
        ? 'QuickBooks connected — the run resumes from its checkpoint and delivers.'
        : !heroTask
          ? 'Blueprint approved — the Summit Launch Agent is spawning under Marketing.'
          : heroTask.blockedOn
            ? `Blocked — only ${personById.get(heroTask.blockedOn.personId)?.name ?? 'one human'} can ${heroTask.blockedOn.what.charAt(0).toLowerCase() + heroTask.blockedOn.what.slice(1)}.`
            : 'Work fans out to Finance, Legal and Support, running in parallel.'

  return (
    <>
      {/* legend — bottom left */}
      <div className="panel absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 p-2.5 text-[11px] text-mut">
        {(
          [
            ['var(--color-task)', 'Task'],
            ['var(--color-artifact)', 'Artifact'],
            ['var(--color-permission)', 'Permission · human'],
            ['var(--color-escalation)', 'Escalation'],
            ['var(--color-guard)', 'Guardrail block'],
          ] as const
        ).map(([c, label]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded" style={{ background: c }} />
            {label}
          </div>
        ))}
      </div>

      {/* zoom controls — left, above legend */}
      <div className="panel absolute bottom-40 left-3 z-10 flex flex-col overflow-hidden text-mut">
        <button className="px-2.5 py-1.5 hover:bg-hover hover:text-ink" title="Zoom in" onClick={() => useStore.getState().requestCamera({ type: 'zoomBy', factor: 1.45 })}>+</button>
        <button className="border-y border-line px-2.5 py-1.5 hover:bg-hover hover:text-ink" title="Zoom out" onClick={() => useStore.getState().requestCamera({ type: 'zoomBy', factor: 1 / 1.45 })}>−</button>
        <button className="px-2 py-1.5 text-[10px] hover:bg-hover hover:text-ink" title="Fit the whole company" onClick={() => useStore.getState().requestCamera({ type: 'fit' })}>fit</button>
      </div>

      {/* one-click hero demo — bottom right (hidden while a panel covers it) */}
      {!replay && (
        <div className="absolute bottom-3 z-10 transition-all" style={{ right: panelW + 12 }}>
          {heroStage === 'idle' && (
            <button
              className="btn btn-primary shadow-[0_1px_2px_rgb(23_22_15/0.08)]"
              onClick={() => useStore.getState().runHeroAuto()}
            >
              ▶ Run the launch demo
            </button>
          )}
          {(heroStage === 'interview' || heroStage === 'blueprint' || heroStage === 'running') && (
            <div className="panel anim-fadeup flex w-[330px] flex-col gap-2 px-3 py-2.5">
              <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase">
                {ACTS.map((label, n) => (
                  <span key={label} className="flex items-center gap-1.5">
                    {n > 0 && <span className="text-dim">→</span>}
                    <span
                      className={cx(
                        n + 1 === act ? 'text-ink' : n + 1 < act ? 'text-mut' : 'text-dim',
                      )}
                    >
                      {n + 1} {label}
                    </span>
                  </span>
                ))}
              </div>
              <div className="flex items-start gap-2 border-t border-line pt-2 text-[12px] leading-snug text-mut">
                <span className="mt-1.5 size-1.5 shrink-0 animate-pulse rounded-full bg-task" />
                {beat}
              </div>
            </div>
          )}
          {heroStage === 'done' && heroTask && (
            <button className="btn btn-primary" onClick={() => useStore.getState().startReplay(heroTask.id)}>
              ↺ Replay the launch
            </button>
          )}
        </div>
      )}

      {/* task focus breadcrumb — bottom center */}
      {task && !replay && (
        <div
          className="pointer-events-none absolute bottom-3 left-0 z-10 flex justify-center px-3 transition-[right] duration-300"
          style={{ right: panelW }}
        >
          <div className="panel anim-fadeup pointer-events-auto flex max-w-full items-center gap-2 px-3 py-2">
            <Chip
              className={cx(
                'shrink-0',
                // `!` beats the Chip atom's own text-mut / border-line in the cascade
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
              {task.path.map((d, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-dim">→</span>}
                  {deptById.get(d)?.name ?? d}
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
