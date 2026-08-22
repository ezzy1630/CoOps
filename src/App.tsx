import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PANEL_WIDTH, useStore } from './store'
import CompanyMap from './map/CompanyMap'
import Header from './components/Header'
import MapOverlays from './components/MapOverlays'
import ReplayScrubber from './components/ReplayScrubber'
import Toasts from './components/Toasts'
import AgentRoom from './components/AgentRoom'
import DeptWorkspace from './components/DeptWorkspace'
import ApprovalsPanel from './components/ApprovalsPanel'
import ActivityPanel from './components/ActivityPanel'
import InheritanceDiff from './components/InheritanceDiff'
import CommandPalette from './components/CommandPalette'
import PersonaGate from './components/PersonaGate'
import FirstRun from './components/FirstRun'
import ArtifactViewer from './components/ArtifactViewer'

export default function App() {
  const entered = useStore((s) => s.entered)
  const panel = useStore((s) => s.panel)
  const startEngine = useStore((s) => s.startEngine)
  const [tooSmall, setTooSmall] = useState(false)

  useEffect(() => {
    startEngine()
    // deep-link entry: ?as=maya|avery|dana (&tour=0 to skip the intro tour)
    const params = new URLSearchParams(window.location.search)
    const as = params.get('as')
    if (as && !useStore.getState().entered) {
      if (params.get('tour') === '0') localStorage.setItem('coops_onboarded', '1')
      useStore.getState().enter(as)
      if (params.get('demo') === '1') setTimeout(() => useStore.getState().runHeroAuto(), 1200)
    }
  }, [startEngine])

  useEffect(() => {
    const check = () => setTooSmall(window.innerWidth < 1080)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        st.setPaletteOpen(!st.paletteOpen)
        return
      }
      if (e.key === 'Escape') {
        if (st.artifactEventId) st.closeArtifact()
        else if (st.paletteOpen) st.setPaletteOpen(false)
        else if (st.replay) st.exitReplay()
        else if (st.selectedTaskId) st.selectTask(null)
        else if (st.panel) st.closePanel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (tooSmall) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Wordmark />
        <p className="max-w-sm text-sm text-mut">
          CoOps is a live map of a whole company — it needs a desktop screen.
          Open it on a laptop or larger to explore Everpeak Outfitters.
        </p>
      </div>
    )
  }

  if (!entered) return <PersonaGate />

  const width = panel ? PANEL_WIDTH[panel.kind] : 0

  return (
    <div className="flex h-full flex-col">
      <Header />
      <main className="relative flex-1 overflow-hidden">
        <CompanyMap />
        <MapOverlays />
        <ReplayScrubber />
        <AnimatePresence>
          {panel && (
            <motion.aside
              key={`${panel.kind}-${panel.id ?? ''}`}
              initial={{ x: width + 24 }}
              animate={{ x: 0 }}
              exit={{ x: width + 24 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="absolute top-0 right-0 bottom-0 z-20"
              style={{ width }}
            >
              <div className="h-full overflow-hidden border-l border-line bg-surface shadow-[-8px_0_24px_rgb(23_22_15/0.04)]">
                {panel.kind === 'agent' && <AgentRoom agentId={panel.id!} />}
                {panel.kind === 'dept' && <DeptWorkspace deptId={panel.id!} />}
                {panel.kind === 'approvals' && <ApprovalsPanel />}
                {panel.kind === 'activity' && <ActivityPanel />}
                {panel.kind === 'diff' && <InheritanceDiff />}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
        <Toasts />
      </main>
      <CommandPalette />
      <FirstRun />
      <ArtifactViewer />
    </div>
  )
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="10.5" fill="none" stroke="var(--color-task)" strokeWidth="1.6" strokeDasharray="3.4 3.1" />
        <circle cx="16" cy="6" r="3" fill="var(--color-ink)" />
        <circle cx="25" cy="21" r="3" fill="var(--color-ink)" />
        <circle cx="7" cy="21" r="3" fill="var(--color-ink)" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">CoOps</span>
    </div>
  )
}
