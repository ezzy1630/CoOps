# Deploying the CoOps server

## Run locally

```sh
npm install            # frontend
npm run dev            # vite on :5173
npm run server         # event server on :8080
```

Open http://localhost:5173/?backend=live — the map folds the same reducer over
the server's SSE stream instead of the built-in simulator. Without
`?backend=live` nothing changes.

## Environment

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `8080` | HTTP listen port (`0` allowed; tests use it) |
| `COOPS_DATA_DIR` | `./server/data` | JSONL event log + per-department memory |
| `COOPS_ALLOW_DEV_EMIT` | off | `1` enables `POST /dev/emit` (demo/test seeding) |
| `COOPS_ENABLE_A2A` | off | `1` mounts A2A protocol routes under `/a2a/<dept>/` |
| `GEMINI_API_KEY` | empty | AI Studio key; activates the Gemini brain |
| `COOPS_GEMINI_MODEL` | `gemini-2.0-flash` | Model for function-calling turns |

## What runs at each capability level

| Level | Requires | Active behavior |
|---|---|---|
| Deterministic | nothing | MockBrain: interviews, exchanges, blueprints, spawns |
| Gemini | `GEMINI_API_KEY` | Function-calling operator turns, department memory, guardrail inspection, dry-run workspace writes |
| A2A | `COOPS_ENABLE_A2A=1` | Agent cards + `SendMessage` per operator (v1.0 + legacy 0.3) |

Any Gemini error falls back to MockBrain for that message, so the demo path
never breaks.

## Cloud Run

```sh
gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT/coops/coops-server
gcloud run deploy coops-server \
  --image us-central1-docker.pkg.dev/PROJECT/coops/coops-server \
  --region us-central1 --allow-unauthenticated \
  --set-env-vars COOPS_ENABLE_A2A=1,GEMINI_API_KEY=KEY
```

Cloud Run injects `PORT`; the container listens on it. Mount a volume or use
Cloud SQL/Firestore later for `/data` persistence across revisions.

## Dormant adapters (implement behind these seams when access exists)

| Planned component | Seam to implement | Local default |
|---|---|---|
| Model Armor guardrails | `server/src/guardrail/types.ts` | heuristic filter (`heuristic.ts`) |
| Memory Bank / Firestore | `server/src/memory/types.ts` | dept-scoped JSONL (`jsonl.ts`) |
| Real Google Workspace writes + OAuth | `server/src/tools/types.ts` | dry-run recorder (`dryrun.ts`) |

Each real implementation replaces the local one without touching call sites —
that is the integration rule from idea.md in practice.
