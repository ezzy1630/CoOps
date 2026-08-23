# CoOps

**Every department gets its own agent team.**

CoOps (Company Operations) is the visual organizational layer for a company's agent fleet: every department has a persistent department agent that runs local worker agents, trades typed tasks with peer departments, and, when blocked, knows exactly **which named human** can unblock it. There is deliberately no company-wide root agent: the empty center of the map is the point.

The repository contains a React frontend and a TypeScript event server. Live mode streams real server events and reports the exact model, storage, guardrail, workspace adapter, A2A posture, Cloud Run revision, and run ID in the UI. Rehearsal mode is an explicit, labeled local dataset for walking through the full product-launch scenario without credentials.

## Run it

```sh
npm install
npm --prefix server install
npm run dev
npm run server
```

Open http://localhost:5173 in **Chrome on a desktop** (voice input uses the Web Speech API).

## What to try

1. Open the runtime inspector in the top bar and confirm the active providers.
2. Pick a persona on the landing screen. The app adapts to Marketing Manager, COO, or Finance Ops Lead authority.
3. Scroll to zoom the company map: departments → agents → task envelopes on the edges.
4. Choose **Run rehearsal** on the landing screen for the deterministic scripted path. Choosing a persona enters Live mode; press **Start** to ask the Marketing Agent to create a launch worker.
5. Click any finished task and press **↺ Replay** to replay asynchronous work in seconds.
6. Open **Activity** to inspect the runtime, event log, tool actions, human gates, artifact provenance, guardrail blocks, and per-task traces.
7. **⌘K** jumps to any agent, task, person, department, or approval.

## Stack

Vite · React 19 · TypeScript · Tailwind v4 · zustand · framer-motion. The map is hand-rolled SVG — deterministic ring layout, semantic zoom, no graph library.

## Backend

A TypeScript event server (`server/`) owns the typed event log, SSE stream,
chat and approval commands, Gemini function-calling brain, department memory,
guardrails, Google Workspace tools, and optional A2A protocol routes. Live mode
is the frontend default. `GEMINI_API_KEY` enables Gemini 3.7 Flash; without it,
the server reports and uses its deterministic mock brain.

```sh
npm run server        # :8080 alongside npm run dev
```

See `server/src/README.md` for routes and `docs/deploy.md` for env vars,
capability levels, and Cloud Run deployment.

## Architecture note

The entire UI is a fold over a typed event log (`src/engine/reducer.ts`). The rehearsal datasets (`src/data/scenarios.ts`, `src/data/hero.ts`) emit the same `WorldEvent` types as the backend and tag every scripted event with `payload.simulated`. Live mode never falls back to those datasets.

Artifact views read one record from `src/artifacts/model.ts`. That module distinguishes live content, rehearsal templates, and metadata-only deliveries. A live event without content never renders authored rehearsal material, and external actions appear only when an event carries a valid URL.

The navigation rail and Activity read the same run summary from `src/evidence/runEvidence.ts`. Secondary pages and panels load on demand so the map remains the fast initial path.

See [docs/architecture.md](docs/architecture.md) for the frontend, backend, Gemini, and Google Cloud execution diagram.
