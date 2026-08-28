---
status: done
---

# Current state

## Verified results

- `src/components/ProofPackage.tsx` now selects the most recent event carrying an authored `rehearsalId` when execution mode is `rehearsal`.
- Rehearsal evidence folds only events with that ID and tasks referenced by those events. Ambient events and tasks without the ID no longer enter the package.
- Live mode still passes the complete event log and world task collection to the existing evidence folds.
- `npm run build` passed on 2026-08-27. TypeScript compilation and the Vite production build completed successfully. Vite emitted only its existing large-chunk advisory.
- Fresh browser QA completed against `http://127.0.0.1:5173/` with the local mock backend on port 8080.
- The horse rehearsal completed through scoped Engineering discovery, verified Cloud Storage staging, Maya's publication approval, the simulated YouTube result, and `Rehearsal complete: publication result recorded`.
- The Audit Package showed `28 of 30 verification checks recorded`. Its CoOps run fields named `Approve YouTube publication: approved` and `Rehearsal complete: publication result recorded`.
- The Audit Package text contained neither `Help-center publish` nor `FAQ refresh`, even though both remained visible in the global Activity stream and approvals queue.
- Replay opened for `Launch video: laptop to YouTube`, displayed `52s of work · 17s replay`, advanced the `Replay position` slider to 1000 ms, and automatically exited after the 17-second replay completed.
- No tests, GitHub, Notion, or external systems were changed.

## Decisions and material failures

- Rehearsal scope is derived at the Audit Package boundary instead of changing the event store or shared evidence folds. This keeps the requested change local and leaves live behavior unchanged.
- When rehearsal mode has no authored rehearsal ID, the package receives empty event and task collections. Ambient activity is not a valid fallback for a rehearsal audit.
- Browser console QA found repeated React duplicate-key errors for `w-horse` and `inh-w-horse`. The log query returned 500 entries, split evenly between those two keys. This defect is outside this packet's writable component and did not block the Audit Package or replay checks.
- After replay automatically exited, the map status returned to `Verified file is staged in Cloud Storage. Waiting for Maya to approve publication.` even though the event log had already recorded approval and task completion. Replay completion therefore restores a stale presentation state.

## Current work

Complete. The bounded implementation and verification are recorded above.

## Unresolved

- React emits repeated duplicate-key errors for `w-horse` and `inh-w-horse` during the horse rehearsal. A later packet should trace where those worker and inheritance nodes are appended more than once.
- Replay completion restores the map to the staged, pre-approval state instead of the completed current state.

## Next action

Parent packet can incorporate this completed Audit Package scope fix. Treat the duplicate-key console defect and stale post-replay map state as separate bounded follow-ups.

## Related packets

- Parent: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`
