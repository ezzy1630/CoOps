import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../utils'

/**
 * Unified modal primitive: focus trap, Escape-to-close, labelled dialog,
 * consistent scrim. Every modal in the app uses this single implementation.
 */
export function Modal({
  onClose,
  children,
  width,
  scrim = 'bg-ink/30 backdrop-blur-xs',
  ariaLabel,
}: {
  onClose: () => void
  children: ReactNode
  width?: number
  scrim?: string
  ariaLabel?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') {
        const el = ref.current
        if (!el) return
        const focusable = el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) {
          e.preventDefault()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus()
    }
  }, [onClose])

  return createPortal(
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${scrim}`} onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal
        aria-label={ariaLabel}
        tabIndex={-1}
        className="panel anim-fadeup overflow-hidden rounded-2xl border border-linebright bg-surface shadow-2xl transition-all"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Compact inline control or count. Quiet by default: no border, no fill.
 * The border is transparent so semantic tints (border-task/40 etc.) can
 * colorize it into a soft ring without re-introducing box-in-box chrome.
 */
export function Chip({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-0.5 text-xs leading-4 font-medium whitespace-nowrap text-mut transition-colors',
        className,
      )}
    />
  )
}

/** Small record qualifier. Color is semantic; shape is deliberately neutral. */
export function Pill({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 font-mono text-[10.5px] font-medium tracking-wide text-mut transition-colors',
        className,
      )}
    />
  )
}

/** 'TaskRequest' -> 'TASK REQUEST' — the designed vocabulary for event types everywhere. */
export function typeLabel(type: string): string {
  return type.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toUpperCase()
}
