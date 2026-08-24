import { X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../store'
import { readRunEvidence } from '../evidence/runEvidence'
import { formatProofPackage, readProofPackage } from '../evidence/proofPackage'
import type { ChainOfCustody, ProofSection, ProofStatus } from '../evidence/proofPackage'
import { Pill } from './ui'

const STATUS_COLOR: Record<ProofStatus, string> = {
  verified: 'var(--color-ok)',
  recorded: 'var(--color-permission)',
  missing: 'var(--color-dim)',
}

const STATUS_LABEL: Record<ProofStatus, string> = {
  verified: 'verified',
  recorded: 'recorded only',
  missing: 'not recorded',
}

const CUSTODY_COLOR: Record<ChainOfCustody['verdict'], string> = {
  verified: 'var(--color-ok)',
  mismatch: 'var(--color-escalation)',
  incomplete: 'var(--color-permission)',
}

/** Every claim in the run, with the receipt that backs it — or the gap where one is missing. */
export default function ProofPackage({ onClose }: { onClose: () => void }) {
  const log = useStore((s) => s.log)
  const world = useStore((s) => s.world)
  const executionMode = useStore((s) => s.executionMode)
  const liveConnection = useStore((s) => s.liveConnection)
  const runtimeInfo = useStore((s) => s.runtimeInfo)
  const [copied, setCopied] = useState(false)

  const pkg = useMemo(() => {
    const tasks = [...world.tasks.values()]
    const evidence = readRunEvidence({ events: log, tasks, executionMode, liveConnection, runtimeInfo })
    return readProofPackage({ events: log, evidence, runtimeInfo })
  }, [log, world, executionMode, liveConnection, runtimeInfo])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  const json = formatProofPackage(pkg)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-6" onClick={onClose}>
      <div className="panel anim-fadeup flex max-h-[86vh] w-[720px] flex-col overflow-hidden" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <span className="font-mono text-[10px] tracking-wider text-dim uppercase">Proof package</span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
            {pkg.recorded} of {pkg.required} receipt fields recorded
          </span>
          <button
            type="button"
            className="cursor-pointer rounded-sm px-1.5 py-0.5 text-[10.5px] text-dim hover:bg-hover hover:text-ink"
            title="Copy the package as JSON"
            onClick={() => {
              void navigator.clipboard?.writeText(json)
              setCopied(true)
            }}
          >
            {copied ? 'copied' : 'copy JSON'}
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-sm px-1.5 py-0.5 text-[10.5px] text-dim hover:bg-hover hover:text-ink"
            title="Download the package as a JSON file"
            onClick={() => downloadJson(json, runtimeInfo?.runId ?? 'run')}
          >
            download
          </button>
          <button className="rounded-sm px-1 py-0.5 text-dim hover:bg-hover hover:text-ink" title="Close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <Custody custody={pkg.chainOfCustody} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {pkg.sections.map((section) => (
            <Section key={section.id} section={section} />
          ))}
        </div>

        <div className="border-t border-line px-3 py-2 font-mono text-[10.5px] text-dim">
          Folded from the event log · a field with no recorded value is shown as a gap, never filled in
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Custody({ custody }: { custody: ChainOfCustody }) {
  const color = CUSTODY_COLOR[custody.verdict]
  const steps: { label: string; value: string | null }[] = [
    { label: 'Found on the laptop', value: custody.checksums.local },
    { label: 'Stored in Cloud Storage', value: custody.checksums.cloud },
    { label: 'Approved by a human', value: custody.checksums.approved },
  ]

  return (
    <section
      aria-label="Chain of custody"
      className="border-b border-line bg-raised/30 px-3 py-2.5"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[12.5px] font-medium" style={{ color }}>
          Chain of custody: {custody.verdict}
        </span>
        <span className="text-[11.5px] text-dim">{custody.detail}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {steps.map((step) => (
          <div key={step.label} className="min-w-0 border border-line bg-surface px-2 py-1.5">
            <div className="text-[10px] text-dim">{step.label}</div>
            <div
              className="mt-0.5 truncate font-mono text-[10.5px]"
              style={{ color: step.value ? 'var(--color-ink)' : 'var(--color-dim)' }}
              title={step.value ?? undefined}
            >
              {step.value ? short(step.value) : 'not recorded'}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Section({ section }: { section: ProofSection }) {
  const color = STATUS_COLOR[section.status]
  return (
    <section className="border-b border-line/60 px-3 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-[13px] font-medium text-ink">{section.title}</h3>
        <Pill className="shrink-0 whitespace-nowrap" style={{ color }}>
          {STATUS_LABEL[section.status]}
        </Pill>
        <span className="font-mono text-[10px] text-dim tabular-nums">
          {section.recorded}/{section.required}
        </span>
        {section.recorded > 0 && !section.live && (
          <Pill className="shrink-0 whitespace-nowrap" style={{ color: 'var(--color-permission)' }}>
            no external system touched
          </Pill>
        )}
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-dim" title={section.claim}>
          {section.claim}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-[minmax(0,190px)_minmax(0,1fr)] gap-x-3 gap-y-1">
        {section.fields.map((field) => (
          <div key={field.key} className="contents">
            <dt className="truncate text-[11.5px] text-mut">{field.label}</dt>
            <dd
              className="truncate font-mono text-[11px]"
              style={{ color: field.value ? 'var(--color-ink)' : 'var(--color-dim)' }}
              title={field.value ?? 'not recorded'}
            >
              {field.value ?? 'not recorded'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function downloadJson(json: string, runId: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `coops-proof-${runId}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/** A checksum is only readable at a glance when it is trimmed to its distinguishing head. */
function short(checksum: string): string {
  const [algorithm, digest] = checksum.includes(':') ? checksum.split(':') : ['', checksum]
  return algorithm ? `${algorithm}:${digest.slice(0, 16)}…` : `${digest.slice(0, 16)}…`
}
