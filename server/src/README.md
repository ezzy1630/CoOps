# CoOps server

Node.js HTTP+SSE backend for the CoOps company-agent simulator. An append-only
world-event log (`EventStore`) feeds a pub/sub `Bus` that streams every event to
connected clients over Server-Sent Events.

Run: `npm --prefix server run dev`

Routes:
- `GET /events?since=<eventId>` — SSE stream; replays the log (after `since` if given), then live events
- `POST /chat` — `{agentId, text, personId}` → appends a Chat event
- `POST /approvals/:eventId/decision` — `{ personId, decision?: "approve" | "deny" }` resolves an auth / approval / blueprint request
- `POST /dev/emit` — `{event}` seeds an arbitrary event (only when dev emit is enabled)
- `GET /healthz` — liveness + event count

Env vars: `PORT` (default 8080), `COOPS_DATA_DIR`, `COOPS_ALLOW_DEV_EMIT=1`,
`GEMINI_API_KEY`. `GEMINI_API_KEY` enables a real LLM agent adapter planned for a later phase.
