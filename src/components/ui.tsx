import type { HTMLAttributes } from 'react'
import { cx } from '../utils'

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
        'inline-flex items-center gap-1 rounded-sm border border-transparent px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-mut',
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
        'inline-flex items-center gap-1 rounded-sm border border-transparent px-1 py-0.5 font-mono text-[10px] tracking-wide text-mut',
        className,
      )}
    />
  )
}

/** 'TaskRequest' -> 'TASK REQUEST' — the designed vocabulary for event types everywhere. */
export function typeLabel(type: string): string {
  return type.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toUpperCase()
}
