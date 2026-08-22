import { AnimatePresence, motion } from 'framer-motion'
import { PANEL_WIDTH, useStore } from '../store'
import { cx } from '../utils'

export default function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const panel = useStore((s) => s.panel)
  return (
    <div
      className="absolute top-3 z-40 flex w-80 flex-col gap-2 transition-all"
      style={{ right: panel ? PANEL_WIDTH[panel.kind] + 12 : 12 }}
    >
      <AnimatePresence>
        {toasts.slice(-3).map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30 }}
            className={cx(
              'panel cursor-pointer p-3',
              t.kind === 'block' && 'border-guard/40',
              t.kind === 'human' && 'border-human/40',
            )}
            onClick={() => useStore.getState().dismissToast(t.id)}
          >
            <div
              className={cx(
                'text-[13px] font-medium',
                t.kind === 'block' && 'text-guard',
                t.kind === 'human' && 'text-human',
              )}
            >
              {t.title}
            </div>
            {t.detail && <div className="mt-0.5 text-[12px] leading-snug text-mut">{t.detail}</div>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
