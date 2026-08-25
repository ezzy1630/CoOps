import { AnimatePresence, motion } from 'framer-motion'
import { PANEL_WIDTH, useStore } from '../store'
import { cx } from '../utils'

/** Transient updates sit above the map status bar and stay clear of slide-overs. */
export default function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const panel = useStore((s) => s.panel)
  const view = useStore((s) => s.view)
  const mapDock = view === 'map'

  return (
    <div
      className={cx(
        'absolute z-40 flex w-80 flex-col gap-2 transition-all',
        mapDock ? 'bottom-[56px]' : 'bottom-4',
      )}
      style={{ right: mapDock && panel ? PANEL_WIDTH[panel.kind] + 12 : 16 }}
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.slice(-3).map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: mapDock ? 8 : -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30, scale: 0.96 }}
            className={cx(
              'cursor-pointer rounded-xl border border-line bg-surface p-3.5 shadow-[0_8px_30px_rgb(0_0_0/0.12)] transition-all hover:border-linebright',
              toast.kind === 'block' && 'border-l-4 border-l-guard',
              toast.kind === 'human' && 'border-l-4 border-l-human',
              toast.kind === 'info' && 'border-l-4 border-l-task',
            )}
            onClick={() => useStore.getState().dismissToast(toast.id)}
          >
            <div
              className={cx(
                'text-[13px] font-semibold',
                toast.kind === 'block' && 'text-guard',
                toast.kind === 'human' && 'text-human',
                toast.kind === 'info' && 'text-ink',
              )}
            >
              {toast.title}
            </div>
            {toast.detail && <div className="mt-1 text-[12px] leading-snug text-mut">{toast.detail}</div>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
