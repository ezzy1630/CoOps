# CoOps

**Every department gets its own agent team.**

CoOps (Company Operations) is the visual organizational layer for a company's agent fleet: every department has a persistent department agent that runs local worker agents, trades typed tasks with peer departments, and — when blocked — knows exactly **which named human** can unblock it. There is deliberately no company-wide root agent: the empty center of the map is the point.

This repository currently contains the **frontend**, running against a deterministic simulated company (Everpeak Outfitters — six departments, ten named humans, a live ambient task loop, and a fully scripted product-launch scenario with a real pause/approve/resume checkpoint). The backend (Gemini + ADK + A2A + Memory Bank + Model Armor on Google Cloud) plugs in behind the same typed event log.

## Run it

```sh
npm install
npm run dev
```

Open http://localhost:5173 in **Chrome on a desktop** (voice input uses the Web Speech API).

## What to try

1. Pick a persona on the landing screen (Marketing Manager / COO / Finance Ops Lead — the app adapts to each).
2. Scroll to zoom the company map: departments → agents → live task envelopes on the edges.
3. Hit **▶ Run the launch demo** (bottom right): Marketing interviews for a new Launch Agent, a human approves the blueprint, the worker spawns and fans out to Finance, Legal and Support. Finance blocks on a QuickBooks connection — the map draws a dotted line to Dana Whitfield, the one person who can fix it. Approve it in **Work & Approvals** (or watch Dana do it) and the run resumes from its checkpoint.
4. Click any finished task and press **↺ Replay** — days of asynchronous work replay in seconds.
5. **⌘K** jumps to any agent, task, person, department or approval.

## Stack

Vite · React 19 · TypeScript · Tailwind v4 · zustand · framer-motion. The map is hand-rolled SVG — deterministic ring layout, semantic zoom, no graph library.

## Architecture note

The entire UI is a fold over a typed event log (`src/engine/reducer.ts`). The simulator (`src/data/scenarios.ts`, `src/data/hero.ts`) emits the same `WorldEvent` types the real backend will; live mode, the activity feed, task focus and the replay scrubber are all the same pure function evaluated at different points in virtual time.
