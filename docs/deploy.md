# Deploying the CoOps server

## Run locally

```sh
npm install            # frontend
npm --prefix server install
npm run dev            # vite on :5173
npm run server         # event server on :8080
```

Open http://localhost:5173. Live is the default and the map folds the reducer
over the server's SSE stream. Use `?mode=rehearsal` only when you intentionally
want the labeled local fixture dataset. Live mode never substitutes rehearsal
events when the backend is unavailable. Vite proxies backend routes to port
8080 in development. Set `VITE_BACKEND_URL` when the deployed frontend and
backend do not share an origin.

## Environment

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `8080` | HTTP listen port (`0` allowed; tests use it) |
| `COOPS_DATA_DIR` | `./server/data` | JSONL event log + per-department memory |
| `COOPS_ALLOW_DEV_EMIT` | off | `1` enables `POST /dev/emit` (demo/test seeding) |
| `COOPS_ENABLE_A2A` | off | `1` mounts A2A protocol routes under `/a2a/<dept>/` |
| `GEMINI_API_KEY` | empty | AI Studio key; activates the Gemini brain |
| `COOPS_GEMINI_MODEL` | `gemini-3.7-flash` | Model for function-calling turns |
| `COOPS_BRAIN` | `auto` | `auto`, `gemini`, or `mock`; `gemini` fails closed without an API key |
| `COOPS_FIRESTORE_PROJECT` | empty | Uses Firestore for department memory instead of JSONL |
| `COOPS_MODELARMOR_PROJECT` | empty | Model Armor project; requires all three Model Armor variables |
| `COOPS_MODELARMOR_LOCATION` | empty | Model Armor location |
| `COOPS_MODELARMOR_TEMPLATE` | empty | Model Armor template ID |
| `COOPS_GOOGLE_CLIENT_ID` | empty | Google OAuth client ID; requires all three OAuth variables |
| `COOPS_GOOGLE_CLIENT_SECRET` | empty | Google OAuth client secret |
| `COOPS_GOOGLE_REDIRECT_URI` | empty | OAuth callback URL, ending in `/auth/google/callback` |
| `COOPS_SHEETS_ID` | empty | Default spreadsheet for Sheets append operations |
| `COOPS_A2A_TOKEN` | empty | Bearer token protecting A2A routes |
| `COOPS_A2A_PRINCIPAL` | `a2a-peer` | Caller identity recorded on authenticated A2A requests |

## What runs at each capability level

| Level | Requires | Active behavior |
|---|---|---|
| Live local | nothing | Server event stream, MockBrain fixture, JSONL memory, heuristic guardrail, audited dry-run tools |
| Gemini | `GEMINI_API_KEY` | Gemini 3.7 Flash function-calling operator turns and generated exchange artifacts |
| Google Cloud | Firestore and Model Armor variables | Firestore department memory and Model Armor inspection |
| Workspace | Google OAuth variables | Scoped Drive uploads and Sheets appends after a user grant; other tools stay dry-run |
| A2A | `COOPS_ENABLE_A2A=1` | Agent cards and `SendMessage` per operator; add `COOPS_A2A_TOKEN` outside local development |

Gemini errors surface as errors in the agent room. They never fall back to a
scripted response. `GET /runtime` is the source of truth for the effective
brain and providers shown by the frontend runtime inspector.

## Cloud Run

```sh
gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT/coops/coops-server
gcloud run deploy coops-server \
  --image us-central1-docker.pkg.dev/PROJECT/coops/coops-server \
  --region us-central1 --allow-unauthenticated \
  --set-env-vars COOPS_BRAIN=gemini,COOPS_GEMINI_MODEL=gemini-3.7-flash
```

Store `GEMINI_API_KEY`, Google OAuth secrets, and any A2A token in Secret
Manager rather than the command line. Cloud Run injects `PORT`; the container
listens on it. Set `COOPS_FIRESTORE_PROJECT` for durable memory across
revisions. The runtime inspector reports Cloud Run's injected `K_REVISION`.

## Provider fallbacks

| Component | Configured provider | Local default |
|---|---|---|
| Guardrails | Model Armor | heuristic filter (`heuristic.ts`) |
| Memory | Firestore | department-scoped JSONL (`jsonl.ts`) |
| Google Drive and Sheets | OAuth-backed adapters | audited dry-run records (`dryrun.ts`) |

Every fallback is named in `/runtime` and visible in the app. A fallback is a
real server mode, not a claim that an external provider ran.
