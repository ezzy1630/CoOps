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
| `COOPS_LOCAL_ROOTS` | empty | Comma- or colon-separated absolute roots the `localfile` connector may read; empty means discovery refuses |
| `COOPS_CONNECTOR_ID` | hostname | Machine identity recorded on every local discovery receipt |
| `COOPS_GCS_BUCKET` | empty | Cloud Storage bucket for the `gcs` handoff; empty keeps the step a labeled dry run |
| `COOPS_PREFLIGHT_QUERY` | `horse` | Filename terms `GET /preflight` searches for when it exercises local discovery |

## What runs at each capability level

| Level | Requires | Active behavior |
|---|---|---|
| Live local | nothing | Server event stream, MockBrain fixture, JSONL memory, heuristic guardrail, audited dry-run tools |
| Gemini | `GEMINI_API_KEY` | Gemini 3.7 Flash function-calling operator turns and generated exchange artifacts |
| Google Cloud | Firestore and Model Armor variables | Firestore department memory and Model Armor inspection |
| Workspace | Google OAuth variables | Scoped Drive uploads and Sheets appends after a user grant; other tools stay dry-run |
| Publication | `COOPS_LOCAL_ROOTS`, `COOPS_GCS_BUCKET`, Google OAuth | Allow-listed local discovery, verified Cloud Storage handoff, and YouTube upload behind a named human approval |
| A2A | `COOPS_ENABLE_A2A=1` | Agent cards and `SendMessage` per operator; add `COOPS_A2A_TOKEN` outside local development |

## Proof package

Every externally observable step returns a receipt on its event
(`payload.receipt`): local discovery, Cloud Storage handoff, the human approval,
and the YouTube publication. Activity → **Proof package** folds them into the
run's receipt checklist and reports one chain-of-custody verdict.

The verdict is `verified` only when the discovered file, the stored object and
the approved asset carry one identical checksum *and* all three steps touched
their real external system. A step that could not reach its system records a
`dry-run` receipt and the verdict stays `incomplete`; a field that was never
recorded reads `not recorded` rather than disappearing. Publication is enforced,
not narrated: `youtube` refuses to upload unless an `ApprovalGranted` event
carries an authority receipt whose checksum matches the staged asset.

Gemini errors surface as errors in the agent room. They never fall back to a
scripted response. `GET /runtime` is the source of truth for the effective
brain and providers shown by the frontend runtime inspector.

## Go/No-Go gates

The launch story may only be recorded when all four gates are true:

1. A real connector identifies a real local file
2. The same bytes are verifiably staged in Google Cloud
3. A named approval actually controls publication
4. YouTube returns a real video ID

`GET /preflight` decides them by executing them against the running server —
the one process holding the OAuth grant and the event log — and never by
reading configuration and assuming it works. Gate 1 runs the real discovery
tool over `COOPS_LOCAL_ROOTS`. Gate 2 passes on a live handoff receipt whose
checksum matches the discovered file; short of that it writes, md5-verifies and
deletes a small probe object to prove the write path. Gate 3 exercises the
publication control on a throwaway fixture: it must refuse an unapproved
publication, refuse an approval covering different bytes, and release only on a
matching one — a gate that never opens is as broken as one that never closes.
Gate 4 passes only on a returned video id; a reachable channel is `ready`.

```sh
npm run preflight                       # against http://localhost:8080
npm --prefix server run preflight -- --json https://coops.example.run.app
```

The route reuses an answer for ten seconds, so an open deployment cannot be
made to repeat the disk walk and the storage probe; `checkedAt` always says when
the reported answer was measured. Exit codes: `0` go, `1` hold or no-go, `2` no
server answered. `hold` means
nothing is broken but a step has not yet been proven by a live run. Nothing in
the preflight publishes: the control instance holds no credentials, and the
Cloud Storage probe writes a text file it then deletes.

If the YouTube API project has not passed its compliance audit, uploads are
restricted to private. The gate reports that as a note rather than a success,
with the wording to use publicly: "Uploaded privately to the launch channel and
ready for release."

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
