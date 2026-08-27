---
status: done
---

# Current state

## Verified results

- A fresh rehearsal reached the historical waiting-for-approval presentation and then the completed current-world presentation with `Restart demo`.
- Source trace shows both replay completion and the user-facing play/pause control share `toggleReplayPlay`.
- `agent-ide actions src/store.ts` completed with `No diagnostics found.`
- `npm run build` passed. TypeScript compiled and Vite built 5,034 modules.
- Fresh browser verification ran rehearsal task `T-1047`. Replay advanced through its historical timeline, reached `16.6s`, changed from `Pause` to `Play`, and preserved slider position `16600` at automatic completion.
- Exiting replay restored the live completed world. The map showed task status `done`, the selected task offered `Replay`, and the rehearsal presenter offered `Restart demo`.
- The event history remained intact. The Horse Launch Agent panel still showed all 11 task events through approval, simulated YouTube result, receipt, and `TASK COMPLETED` after replay exit.

## Decisions and material failures

- `CompanyMap` completes replay by setting `wallMs` to `durationMs`, then calling `toggleReplayPlay`.
- The old toggle reset `wallMs` to `0` whenever it was at the duration, including while pausing an active replay. That folded the rendered replay world back to its pre-task state.
- The minimal fix resets to `0` only when starting a paused replay from its final frame. Pausing an active replay now preserves the final frame.
- A duplicate frontend on port 4173 was stopped. Verification uses the requested local pair, frontend 5173 and server 8080.

## Current work

Complete. Only `src/store.ts` and this packet state file were changed for this packet.

## Unresolved

- None.

## Next action

Parent packet may consume this completed handoff.

## Related packets

- Parent: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`
