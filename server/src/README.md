# CoOps server

Node.js HTTP+SSE backend for CoOps. An append-only
world-event log (`EventStore`) feeds a pub/sub `Bus` that streams every event to
connected clients over Server-Sent Events.

Run: `npm --prefix server run dev`

Routes:
- `GET /events?since=<eventId>` — SSE stream; replays the log (after `since` if given), then live events
- `POST /chat` — `{agentId, text, personId}` → appends a Chat event
- `POST /approvals/:eventId/decision` — `{ personId, decision?: "approve" | "deny" }` resolves an auth / approval / blueprint request
- `POST /dev/emit` — `{event}` seeds an arbitrary event (only when dev emit is enabled)
- `GET /healthz` — liveness + event count
- `GET /runtime` — effective model, providers, revision, and run identity
- `GET /presence` — connected people
- `GET /org` — active organization registry
- `GET /preflight` — the four Go/No-Go gates, decided by executing them against this server
- `GET /auth/google/start` — start Google Drive and Sheets OAuth when configured
- `GET /auth/google/callback` — finish Google OAuth

`GEMINI_API_KEY` enables the Gemini brain using `gemini-3.7-flash` by default.
Without a key, the server runs and reports its deterministic mock brain. See
`docs/deploy.md` for the complete environment and provider matrix.
