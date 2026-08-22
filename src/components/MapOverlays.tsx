import { PANEL_WIDTH, useStore } from '../store'
import { deptById } from '../data/company'
import { cx } from '../utils'

/** Legend, zoom controls, the one-click demo trigger, and the task-focus breadcrumb. */
export default function MapOverlays() {
  const heroStage = useStore((s) => s.heroStage)
  const selectedTaskId = useStore((s) => s.selectedTaskId)
  const replay = useStore((s) => s.replay)
  const world = useStore((s) => s.world)
  const panel = useStore((s) => s.panel)

  const task = selectedTaskId ? world.tasks.get(selectedTaskId) : null

  const heroTask = [...world.tasks.values()].find((t) => t.title.startsWith('Summit Series launch'))

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
        <div className="absolute bottom-3 z-10 transition-all" style={{ right: panel ? PANEL_WIDTH[panel.kind] + 12 : 12 }}>
          {heroStage === 'idle' && (
            <button className="btn btn-primary shadow-lg shadow-task/10" onClick={() => useStore.getState().runHeroAuto()}>
              ▶ Run the launch demo
            </button>
          )}
          {(heroStage === 'interview' || heroStage === 'blueprint' || heroStage === 'running') && (
            <div className="panel flex items-center gap-2 px-3 py-2 text-[12px] text-mut">
              <span className="size-2 animate-pulse rounded-full bg-task" />
              Launch demo in motion — watch the map
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
        <div className="panel anim-fadeup absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 px-3 py-2">
          <span
            className={cx(
              'chip',
              task.status === 'done' && 'border-artifact/50 text-artifact',
              (task.status === 'waiting_auth' || task.status === 'waiting_approval') && 'border-permission/50 text-permission',
              task.status === 'running' && 'border-task/50 text-task',
              task.status === 'failed' && 'border-escalation/50 text-escalation',
            )}
          >
            {task.status.replace('_', ' ')}
          </span>
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
      )}
    </>
  )
}
