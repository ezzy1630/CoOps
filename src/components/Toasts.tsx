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
        mapDock ? 'bottom-[70px]' : 'top-3',
      )}
      style={{ right: mapDock && panel ? PANEL_WIDTH[panel.kind] + 12 : 12 }}
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.slice(-3).map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: mapDock ? 8 : -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30 }}
            className={cx(
              'cursor-pointer rounded-md border bg-surface p-3 shadow-[0_2px_10px_rgb(23_22_15/0.1)]',
              toast.kind === 'block' && 'border-guard/40',
              toast.kind === 'human' && 'border-human/40',
              toast.kind === 'info' && 'border-line',
            )}
            onClick={() => useStore.getState().dismissToast(toast.id)}
          >
            <div
              className={cx(
                'text-[12px] font-medium',
                toast.kind === 'block' && 'text-guard',
                toast.kind === 'human' && 'text-human',
              )}
            >
              {toast.title}
            </div>
            {toast.detail && <div className="mt-0.5 text-[11px] leading-snug text-mut">{toast.detail}</div>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
