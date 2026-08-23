import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PANEL_WIDTH, useStore } from './store'
import CompanyMap from './map/CompanyMap'
import Header from './components/Header'
import NavRail from './components/NavRail'
import MapOverlays from './components/MapOverlays'
import ReplayScrubber from './components/ReplayScrubber'
import Toasts from './components/Toasts'
import PersonaGate from './components/PersonaGate'
import { getRehearsal } from './engine/rehearsals'

const PixelMap = lazy(() => import('./map/pixel/PixelMap'))
const AgentRoom = lazy(() => import('./components/AgentRoom'))
const DeptWorkspace = lazy(() => import('./components/DeptWorkspace'))
const ApprovalsPanel = lazy(() => import('./components/ApprovalsPanel'))
const ActivityPanel = lazy(() => import('./components/ActivityPanel'))
const InheritanceDiff = lazy(() => import('./components/InheritanceDiff'))
const CommandPalette = lazy(() => import('./components/CommandPalette'))
const FirstRun = lazy(() => import('./components/FirstRun'))
const ArtifactViewer = lazy(() => import('./components/ArtifactViewer'))
const ActivityPage = lazy(() => import('./pages/ActivityPage'))
const AgentsPage = lazy(() => import('./pages/AgentsPage'))
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage'))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'))

export default function App() {
  const entered = useStore((s) => s.entered)
  const view = useStore((s) => s.view)
  const panel = useStore((s) => s.panel)
  const mapStyle = useStore((s) => s.mapStyle)
  const startEngine = useStore((s) => s.startEngine)
  const paletteOpen = useStore((s) => s.paletteOpen)
  const firstRunStep = useStore((s) => s.firstRunStep)
  const artifactEventId = useStore((s) => s.artifactEventId)
  const [tooSmall, setTooSmall] = useState(false)

  useEffect(() => {
    startEngine()
    // Deep-link entry: ?as=maya|avery|dana (&tour=0 to skip the intro tour).
    // In explicit rehearsal mode, ?demo=1 resolves the registry default and an
    // exact demo id resolves that definition. A guided rehearsal supplies its
    // owner viewpoint when the URL does not name one.
    const params = new URLSearchParams(window.location.search)
    const demoParam = params.get('demo')
    const demo = demoParam && useStore.getState().executionMode === 'rehearsal'
      ? getRehearsal(demoParam === '1' ? undefined : demoParam)
      : undefined
    const as = params.get('as') ?? demo?.ownerId
    if (as && !useStore.getState().entered) {
      if (demo || params.get('tour') === '0') localStorage.setItem('coops_onboarded', '1')
      useStore.getState().enter(as)
    }
    let demoTimer: number | undefined
    if (demo) {
      demoTimer = window.setTimeout(
        () => useStore.getState().runRehearsal(demo.id),
        1200,
      )
    }
    return () => {
      if (demoTimer !== undefined) window.clearTimeout(demoTimer)
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
        else if (st.view !== 'map') st.setView('map')
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
        <p className="max-w-sm text-[14px] leading-relaxed text-mut">
          CoOps is a live map of a whole company, so it needs a desktop screen.
          Open it on a laptop or larger to explore Everpeak Outfitters.
        </p>
      </div>
    )
  }

  const width = panel ? PANEL_WIDTH[panel.kind] : 0
  const mapView = view === 'map'

  // Pre-entry, the engine is already running: render the live map full-screen
  // with the persona gate as a translucent veil above it. The map stays mounted
  // across entry, so choosing a persona hands the camera straight to the app.
  return (
    <div className="flex h-full">
      {entered && <NavRail />}
      <div className="flex min-w-0 flex-1 flex-col">
        {entered && <Header />}
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <div className={mapView || !entered ? 'absolute inset-0' : 'invisible absolute inset-0'}>
            {mapStyle === 'fun' ? (
              <Suspense fallback={null}>
                <PixelMap />
              </Suspense>
            ) : (
              <CompanyMap />
            )}
          </div>

          {entered && !mapView && (
            <div className="absolute inset-0 z-10 overflow-auto bg-bg">
              <PageContent view={view} />
            </div>
          )}

          {entered && mapView && <MapOverlays />}
          {entered && mapView && <ReplayScrubber />}
          <AnimatePresence>
            {entered && mapView && panel && (
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
                  <Suspense fallback={<LoadingSurface compact />}>
                    {panel.kind === 'agent' && <AgentRoom agentId={panel.id!} />}
                    {panel.kind === 'dept' && <DeptWorkspace deptId={panel.id!} />}
                    {panel.kind === 'approvals' && <ApprovalsPanel />}
                    {panel.kind === 'activity' && <ActivityPanel />}
                    {panel.kind === 'diff' && <InheritanceDiff />}
                  </Suspense>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
          {entered && <Toasts />}
          <AnimatePresence>{!entered && <PersonaGate />}</AnimatePresence>
        </main>

        {entered && (
          <>
            <Suspense fallback={null}>
              {paletteOpen && <CommandPalette />}
              {firstRunStep != null && <FirstRun />}
              {artifactEventId && <ArtifactViewer />}
            </Suspense>
          </>
        )}
      </div>
    </div>
  )
}

function PageContent({ view }: { view: ReturnType<typeof useStore.getState>['view'] }) {
  return (
    <Suspense fallback={<LoadingSurface />}>
      {view === 'approvals' && <ApprovalsPage />}
      {view === 'activity' && <ActivityPage />}
      {view === 'agents' && <AgentsPage />}
      {view === 'documents' && <DocumentsPage />}
    </Suspense>
  )
}

function LoadingSurface({ compact = false }: { compact?: boolean }) {
  return (
    <div className="h-full bg-surface px-6 py-5" role="status" aria-label="Loading view">
      <div className="h-5 w-28 bg-raised" />
      <div className="mt-5 border-t border-line pt-4">
        {Array.from({ length: compact ? 4 : 7 }, (_, index) => (
          <div key={index} className="mb-3 grid grid-cols-[96px_1fr_120px] gap-4">
            <span className="h-3 bg-raised" />
            <span className="h-3 bg-raised" />
            <span className="h-3 bg-raised" />
          </div>
        ))}
      </div>
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
