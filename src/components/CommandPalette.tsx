import { MagnifyingGlass } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useStore } from '../store'
import { getDepartments, getPeople, deptById, personById } from '../data/company'
import { rehearsals } from '../engine/rehearsals'
import type { Task } from '../types'
import { cx } from '../utils'

// ─── Entry model ─────────────────────────────────────────────────────────────

type Group = 'Actions' | 'Departments' | 'Agents' | 'People' | 'Tasks' | 'Approvals'

interface Entry {
  key: string
  group: Group
  title: string
  sub: string
  action: () => void
  tickHue?: number
}

const GROUP_ORDER: Group[] = ['Actions', 'Departments', 'Agents', 'People', 'Tasks', 'Approvals']

const GROUP_DOT: Record<Group, string> = {
  Actions: 'var(--color-task)',
  Departments: 'var(--color-mut)',
  Agents: 'var(--color-artifact)',
  People: 'var(--color-human)',
  Tasks: 'var(--color-task)',
  Approvals: 'var(--color-permission)',
}

const MAX_TASKS = 10
const MAX_VISIBLE = 14

const deptName = (id: string) => deptById.get(id)?.name ?? id
const statusLabel = (s: Task['status']) => s.replace('_', ' ')

function CapabilityGlyph() {
  return (
    <svg viewBox="0 0 10 12" className="size-2.5 shrink-0 text-permission" aria-hidden="true">
      <path d="M2.6 5.2V3.5a2.4 2.4 0 0 1 4.8 0v1.7" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.2" y="5.2" width="7.6" height="6" rx="1.3" fill="currentColor" />
    </svg>
  )
}

/** Active work first, then the most recently finished. */
function rankTasks(tasks: Task[]): Task[] {
  const isActive = (t: Task) => t.status !== 'done' && t.status !== 'failed'
  const ended = (t: Task) => t.endedAt ?? t.createdAt
  const active = tasks.filter(isActive).sort((a, b) => b.createdAt - a.createdAt)
  const recent = tasks.filter((t) => !isActive(t)).sort((a, b) => ended(b) - ended(a))
  return [...active, ...recent].slice(0, MAX_TASKS)
}

/** The universal escape hatch — every noun in the company is one ⌘K away. */
export default function CommandPalette() {
  const open = useStore((s) => s.paletteOpen)
  const world = useStore((s) => s.world)
  const theme = useStore((s) => s.theme)
  const executionMode = useStore((s) => s.executionMode)

  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])

  // ── every reachable destination, in group order ──
  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = []
    const st = () => useStore.getState()

    for (const rehearsal of rehearsals) {
      const command = rehearsal.command[executionMode]
      out.push({
        key: `act:rehearsal:${rehearsal.id}`,
        group: 'Actions',
        title: command.title,
        sub: command.description,
        action: () => st().runRehearsal(rehearsal.id),
      })
    }

    out.push(
      {
        key: 'act:fit',
        group: 'Actions',
        title: 'Fit the whole company',
        sub: `Zoom out to all ${getDepartments().length} departments at once`,
        action: () => st().requestCamera({ type: 'fit' }),
      },
      {
        key: 'act:approvals',
        group: 'Actions',
        title: 'Open Work & Approvals',
        sub: 'Everything waiting on a human right now',
        action: () => st().openPanel('approvals'),
      },
      {
        key: 'act:activity',
        group: 'Actions',
        title: 'Open Activity',
        sub: 'The raw event log behind the map',
        action: () => st().openPanel('activity'),
      },
      {
        key: 'act:tour',
        group: 'Actions',
        title: 'Replay the intro tour',
        sub: 'Three steps: zoom, focus, jump',
        action: () => st().setFirstRunStep(0),
      },
      {
        key: 'act:theme',
        group: 'Actions',
        title: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        sub: 'Flip the whole map between warm paper and warm charcoal',
        action: () => st().toggleTheme(),
      },
      {
        key: 'act:style-blueprint',
        group: 'Actions',
        title: 'View: Blueprint map',
        sub: 'The classic drafting-table visualization',
        action: () => st().setMapStyle('classic'),
      },
      {
        key: 'act:style-valley',
        group: 'Actions',
        title: 'View: Valley map',
        sub: 'Pixel-art village rendering of the same company',
        action: () => st().setMapStyle('fun'),
      },
    )

    for (const d of getDepartments()) {
      out.push({
        key: `dept:${d.id}`,
        group: 'Departments',
        title: d.name,
        sub: d.blurb,
        tickHue: personById.get(d.leadId)?.hue,
        action: () => {
          st().requestCamera({ type: 'dept', deptId: d.id })
          st().openPanel('dept', d.id)
        },
      })
    }

    for (const a of world.agents) {
      out.push({
        key: `agent:${a.id}`,
        group: 'Agents',
        title: a.name,
        sub: `${a.kind === 'operator' ? 'Department Agent' : 'Worker'} · ${deptName(a.deptId)}`,
        tickHue: personById.get(a.ownerId)?.hue,
        action: () => {
          st().requestCamera({ type: 'agent', agentId: a.id })
          st().openPanel('agent', a.id)
        },
      })
    }

    for (const p of getPeople()) {
      out.push({
        key: `person:${p.id}`,
        group: 'People',
        title: p.name,
        sub: p.owns.length > 0 ? `${p.role} · owns ${p.owns[0]}` : p.role,
        tickHue: p.hue,
        action: () => st().openPanel('dept', p.deptId),
      })
    }

    for (const t of rankTasks([...world.tasks.values()])) {
      out.push({
        key: `task:${t.id}`,
        group: 'Tasks',
        title: t.title,
        sub: `${statusLabel(t.status)} · ${deptName(t.originDept)}`,
        tickHue: personById.get(deptById.get(t.originDept)?.leadId ?? '')?.hue,
        action: () => {
          st().selectTask(t.id)
          if (t.path.length > 1) st().requestCamera({ type: 'fit' })
        },
      })
    }

    for (const a of world.approvals) {
      out.push({
        key: `approval:${a.eventId}`,
        group: 'Approvals',
        title: a.what,
        sub: `waiting on ${personById.get(a.personId)?.name ?? 'a human'}`,
        tickHue: personById.get(a.personId)?.hue,
        action: () => st().openPanel('approvals'),
      })
    }

    return out
  }, [world, theme, executionMode])

  // ── filter: every word of the query must land somewhere in title + sub ──
  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const pool =
      words.length === 0
        ? entries.filter((e) => e.group === 'Actions' || e.group === 'Departments')
        : entries.filter((e) => {
            const hay = `${e.title} ${e.sub}`.toLowerCase()
            return words.every((w) => hay.includes(w))
          })
    // stable sort keeps groups contiguous no matter how entries were built
    const ordered = [...pool].sort(
      (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
    )
    return ordered.slice(0, MAX_VISIBLE)
  }, [entries, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    setIndex((i) => (i >= visible.length ? 0 : i))
  }, [visible.length])

  useEffect(() => {
    rowRefs.current[index]?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!open) return null

  const close = () => useStore.getState().setPaletteOpen(false)

  const run = (e: Entry) => {
    e.action()
    close()
  }

  const onKeyDown = (ev: ReactKeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      setIndex((i) => (visible.length === 0 ? 0 : (i + 1) % visible.length))
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      setIndex((i) => (visible.length === 0 ? 0 : (i - 1 + visible.length) % visible.length))
    } else if (ev.key === 'Enter') {
      ev.preventDefault()
      const entry = visible[index]
      if (entry) run(entry)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/25" onClick={close} />

      <div className="absolute top-[18vh] left-1/2 w-[560px] -translate-x-1/2">
        <div className="panel anim-fadeup flex max-h-[60vh] flex-col overflow-hidden rounded-sm">
          {/* search */}
          <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-3">
            <MagnifyingGlass size={14} className="shrink-0 text-dim" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setIndex(0)
              }}
              onKeyDown={onKeyDown}
              placeholder="Jump to any agent, task, person, department, or approval…"
              className="h-12 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-dim"
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          {/* results */}
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {visible.length === 0 && (
              <div className="px-3 py-8 text-center text-[12.5px] text-dim">
                Nothing matches that. Try a department, a person, or a task.
              </div>
            )}
            {visible.map((e, i) => (
              <div key={e.key}>
                {(i === 0 || visible[i - 1].group !== e.group) && (
                  <div className="px-2 pt-2 pb-1 font-mono text-[10px] tracking-wider text-dim uppercase">
                    {e.group}
                  </div>
                )}
                <button
                  ref={(el) => {
                    rowRefs.current[i] = el
                  }}
                  onClick={() => run(e)}
                  onMouseMove={() => setIndex(i)}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors',
                    i === index ? 'bg-hover ring-1 ring-linebright/80' : 'hover:bg-hover/50',
                  )}
                >
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="size-1.5 rounded-full" style={{ background: GROUP_DOT[e.group] }} />
                    {e.tickHue != null && (
                      <span
                        aria-hidden
                        className="h-3 w-0.5 rounded-full"
                        style={{ background: `hsl(${e.tickHue} 56% 52%)` }}
                      />
                    )}
                  </span>
                  {e.group === 'Approvals' && <CapabilityGlyph />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">{e.title}</span>
                    <span className="block truncate text-[11.5px] text-dim">{e.sub}</span>
                  </span>
                </button>
              </div>
            ))}
          </div>

          {/* footer */}
          <div className="flex shrink-0 items-center gap-1.5 border-t border-line bg-raised/60 px-3 py-2 text-[11.5px] text-dim">
            <span className="kbd">↑↓</span>
            navigate
            <span className="px-1">·</span>
            <span className="kbd">↵</span>
            open
            <span className="px-1">·</span>
            <span className="kbd">esc</span>
            close
          </div>
        </div>
      </div>
    </div>
  )
}
