import type { HTMLAttributes } from 'react'
import { cx } from '../utils'

/** The one chip: 6px radius, hairline border. Every panel imports this instead of rolling its own. */
export function Chip({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-mut',
        className,
      )}
    />
  )
}

/** Small mono status pill for event types and section kickers. */
export function Pill({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cx(
        'inline-flex items-center rounded-md border border-line bg-raised px-1.5 py-0.5 font-mono text-[9.5px] tracking-wider uppercase',
        className,
      )}
    />
  )
}

/** 'TaskRequest' -> 'TASK REQUEST' — the designed vocabulary for event types everywhere. */
export function typeLabel(type: string): string {
  return type.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toUpperCase()
}
