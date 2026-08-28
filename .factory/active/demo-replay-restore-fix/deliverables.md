# Demo replay restore fix

## Source

- Kind: Parent packet QA finding
- Record: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`

## Outcome

Make a replay of the completed horse-launch task return to the actual completed current world instead of leaving the map or rehearsal presenter at a staged, waiting-for-approval state.

## Completion

- The worker reproduces the stale post-replay state and identifies which replay clock, world fold, selection, or presentation value causes it.
- During replay, the map shows the historical task progression through approval and completion.
- When replay reaches the end or the user exits, the map, selected task, and rehearsal presenter reflect the current completed world and offer the completed/restart state.
- The fix does not mutate or truncate the durable event log and does not change normal live rendering.
- The production build passes and a fresh browser run verifies the full rehearsal plus replay exit.
- No test files, GitHub records, Notion records, or external systems are changed.

## Scope

Writable:

- `C:\Users\heroi\Code\Workspace\Src\CoOps\src\store.ts`
- `C:\Users\heroi\Code\Workspace\Src\CoOps\src\engine\replay.ts`
- `C:\Users\heroi\Code\Workspace\Src\CoOps\src\map\CompanyMap.tsx`
- `C:\Users\heroi\Code\Workspace\Src\CoOps\src\map\pixel\PixelMap.tsx`
- `C:\Users\heroi\Code\Workspace\Src\CoOps\src\components\MapOverlays.tsx`
- `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\demo-replay-restore-fix\state.md`

Read-only dependencies:

- Existing rehearsal events, reducer, ReplayScrubber, and sibling changes

## Inputs

- Fresh QA result: replay ran to the end, then the map presenter returned to `Verified file is staged in Cloud Storage. Waiting for Maya to approve publication.` despite a recorded completion.

## Outputs

- Evidence-backed root-cause fix and fresh build/browser verification in `state.md`
