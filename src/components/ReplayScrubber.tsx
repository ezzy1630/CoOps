import { useStore } from '../store'
import { fmtDuration } from '../utils'

/** Timeline scrubber: weeks of asynchronous work replay in seconds. */
export default function ReplayScrubber() {
  const replay = useStore((s) => s.replay)
  const world = useStore((s) => s.world)
  if (!replay) return null

  const task = world.tasks.get(replay.taskId)
  const knots = replay.knots
  const span = knots[knots.length - 1].virtual - knots[0].virtual

  return (
    <div className="panel anim-fadeup absolute bottom-3 left-1/2 z-20 flex w-[620px] -translate-x-1/2 flex-col gap-1.5 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="chip border-task/50 text-task">REPLAY</span>
        <span className="truncate text-[13px] font-medium">{task?.title ?? replay.taskId}</span>
        <span className="text-[11px] text-dim">{fmtDuration(span)} of work · {Math.round(replay.durationMs / 1000)}s replay</span>
        <div className="flex-1" />
        <button className="text-[12px] text-dim hover:text-ink" onClick={() => useStore.getState().exitReplay()}>
          exit ✕
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="btn size-8 shrink-0 rounded-full p-0 text-[13px]"
          onClick={() => useStore.getState().toggleReplayPlay()}
        >
          {replay.playing ? '❚❚' : '▶'}
        </button>
        <div className="relative flex-1">
          {/* event tick marks */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-3 -translate-y-1/2">
            {knots.slice(1, -1).map((kn, i) => (
              <span
                key={i}
                className="absolute top-0 h-3 w-px bg-linebright"
                style={{ left: `${(kn.wall / replay.durationMs) * 100}%` }}
              />
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={replay.durationMs}
            value={replay.wallMs}
            onChange={(e) => useStore.getState().setReplayWall(Number(e.target.value))}
            className="relative w-full accent-(--color-task)"
          />
        </div>
        <span className="w-10 shrink-0 text-right font-mono text-[11px] text-dim">
          {Math.round(replay.wallMs / 1000)}s
        </span>
      </div>
    </div>
  )
}
