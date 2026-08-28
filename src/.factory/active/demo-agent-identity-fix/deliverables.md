# Demo agent identity fix

## Source

- Kind: Parent packet QA finding
- Record: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`

## Outcome

Ensure the Horse Launch Agent has one identity in the default rehearsal instead of appearing once in the company seed and again when the blueprint spawns it.

## Completion

- Before the blueprint is approved, `w-horse` is not already mounted as an existing worker if the rehearsal is meant to create it.
- After the `AgentSpawned` event, exactly one `w-horse` and one corresponding inheritance row render.
- The browser console has no duplicate-key errors for `w-horse` or `inh-w-horse` during the complete horse rehearsal.
- The production build passes and the visible flow still reaches the spawned worker and cross-department task.
- No test files, GitHub records, Notion records, or external systems are changed.

## Scope

Writable:

- `C:\Users\heroi\Code\Workspace\Src\CoOps\src\data\companies\horse.ts`
- `C:\Users\heroi\Code\Workspace\Src\CoOps\src\.factory\active\demo-agent-identity-fix\state.md`

Read-only dependencies:

- Existing Horse rehearsal script, reducer, map and agent views

## Inputs

- Fresh browser console QA with repeated duplicate keys `w-horse` and `inh-w-horse`

## Outputs

- Minimal identity-origin fix and build/browser evidence in `state.md`
