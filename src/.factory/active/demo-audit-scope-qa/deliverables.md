# Demo Audit Package scope and QA

## Source

- Kind: Parent packet finding
- Record: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`

## Outcome

Keep the rehearsal Audit Package internally consistent by folding only the current authored rehearsal instead of unrelated ambient work, then complete the missing post-change replay and console checks.

## Completion

- In rehearsal mode, the Audit Package derives its events and tasks from the most recent authored rehearsal ID and excludes ambient events without that ID.
- The CoOps approval and completion fields name the horse-launch approval and completion after the flagship rehearsal.
- Live mode continues to fold the complete live event log.
- The production build passes.
- A fresh browser run verifies the horse flow, Audit Package fields, replay, and browser console after all current local changes.
- No test files, GitHub records, Notion records, or external systems are changed.

## Scope

Writable:

- `C:\Users\heroi\Code\Workspace\Src\CoOps\src\components\ProofPackage.tsx`
- `C:\Users\heroi\Code\Workspace\Src\CoOps\src\.factory\active\demo-audit-scope-qa\state.md`

Read-only dependencies:

- Existing store state, run-evidence and proof-package folds, horse rehearsal events, and current sibling changes

## Inputs

- UI rehearsal residual finding
- Completed proof-honesty and visible-flow changes

## Outputs

- Minimal Audit Package scoping change and fresh browser/build evidence in `state.md`
