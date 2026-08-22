import { PANEL_WIDTH, useStore } from '../store'
import { virtualAt } from '../engine/replay'
import { fmtDuration } from '../utils'
import { Chip } from './ui'

/** Virtual clock readout — same vocabulary as the header clock. */
const fmtVirtual = (ts: number) =>
  new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Timeline scrubber: weeks of asynchronous work replay in seconds. */
export default function ReplayScrubber() {
  const replay = useStore((s) => s.replay)
  const world = useStore((s) => s.world)
  const panel = useStore((s) => s.panel)
  if (!replay) return null

  const task = world.tasks.get(replay.taskId)
  const knots = replay.knots
  const span = knots[knots.length - 1].virtual - knots[0].virtual
  const pct = Math.max(0, Math.min(1, replay.wallMs / replay.durationMs)) * 100
  // centre on the map that is still visible, not on the viewport hidden under a panel
  const panelW = panel ? PANEL_WIDTH[panel.kind] : 0

  return (
    <div
      className="pointer-events-none absolute bottom-[70px] left-0 z-20 flex justify-center px-3 transition-[right] duration-300"
      style={{ right: panelW }}
    >
      <div className="panel anim-fadeup pointer-events-auto flex w-[620px] max-w-full flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2.5">
          {/* play state — the REPLAY badge lives in the header clock, not twice on screen */}
          <Chip className="gap-1.5 font-mono tabular-nums">
            <span className={replay.playing ? 'text-task' : 'text-dim'}>{replay.playing ? '▶' : '❚❚'}</span>
            {(replay.wallMs / 1000).toFixed(1)}s
          </Chip>
          <span className="truncate text-[13px] font-medium">{task?.title ?? replay.taskId}</span>
          <span className="shrink-0 text-[11px] text-dim">
            {fmtDuration(span)} of work · {Math.round(replay.durationMs / 1000)}s replay
          </span>
          <div className="flex-1" />
          <button className="text-[12px] text-dim hover:text-ink" onClick={() => useStore.getState().exitReplay()}>
            exit ✕
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn size-8 shrink-0 rounded-full p-0 text-[13px]"
            onClick={() => useStore.getState().toggleReplayPlay()}
            title={replay.playing ? 'Pause' : 'Play'}
          >
            {replay.playing ? '❚❚' : '▶'}
          </button>
          <div className="relative flex-1">
            {/* hairline track + played portion + event tick marks (the input paints its thumb over these) */}
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-linebright" />
            <div
              className="pointer-events-none absolute top-1/2 left-0 h-px -translate-y-1/2 bg-ink"
              style={{ width: `${pct}%` }}
            />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2">
              {knots.slice(1, -1).map((kn, i) => (
                <span
                  key={i}
                  className="absolute top-0 h-2.5 w-px bg-linebright"
                  style={{ left: `${(kn.wall / replay.durationMs) * 100}%` }}
                />
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={replay.durationMs}
              value={replay.wallMs}
              aria-label="Replay position"
              onChange={(e) => useStore.getState().setReplayWall(Number(e.target.value))}
              className="scrub relative w-full"
            />
          </div>
          {/* the advancing virtual clock — where in the real weeks of work we are */}
          <span className="w-[112px] shrink-0 text-right font-mono text-[11px] tabular-nums text-mut">
            {fmtVirtual(virtualAt(knots, replay.wallMs))}
          </span>
        </div>
      </div>
    </div>
  )
}
