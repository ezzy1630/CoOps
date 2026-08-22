import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '../store'

// Global document viewer for delivered artifacts. Opened from anywhere via
// useStore().openArtifact(eventId) where eventId is an ArtifactDelivered event id.
export default function ArtifactViewer() {
  const eventId = useStore((s) => s.artifactEventId)
  const log = useStore((s) => s.log)
  const close = useStore((s) => s.closeArtifact)
  const ev = eventId ? log.find((e) => e.id === eventId) : undefined

  return createPortal(
    <AnimatePresence>
      {ev && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(29_28_23/0.34)] p-8"
          onClick={close}
        >
          <motion.div
            initial={{ scale: 0.97, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98, y: 6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="max-h-full w-[640px] overflow-y-auto border border-line bg-surface p-10 shadow-[0_16px_48px_rgb(23_22_15/0.14)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 border-b border-line pb-4">
              <div className="text-[11px] font-semibold tracking-[0.18em] text-mut uppercase">Everpeak Outfitters</div>
              <h2 className="mt-2 text-lg font-semibold">
                {typeof ev.payload?.artifact === 'string' ? ev.payload.artifact : ev.payload?.artifact?.name ?? ev.title}
              </h2>
            </div>
            <p className="text-sm text-mut">{ev.detail}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
