import type { HTMLAttributes } from 'react'
import { cx } from '../utils'

/** Compact inline control or count. It stays quiet next to the record it qualifies. */
export function Chip({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex items-center gap-1 border border-line px-1.5 py-0.5 text-[10px] font-medium text-mut',
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
        'inline-flex items-center gap-1 font-mono text-[9.5px] text-mut',
        className,
      )}
    />
  )
}

/** 'TaskRequest' -> 'TASK REQUEST' — the designed vocabulary for event types everywhere. */
export function typeLabel(type: string): string {
  return type.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toUpperCase()
}
