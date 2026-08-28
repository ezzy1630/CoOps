# Demo proof honesty fixes

## Source

- Kind: Parent packet findings
- Record: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`

## Outcome

Remove false or ambiguous proof signals from the demo: a local runtime must not count as verified Cloud Run execution, recorded-only evidence must not claim an external action happened, and rehearsal artifacts must explicitly say that they come from a labeled local rehearsal.

## Completion

- A runtime with `execution: live` and revision `local` cannot make the CoOps proof section live, verified, or complete as Cloud Run evidence.
- A live runtime with a real non-local revision can still satisfy the CoOps proof section when all required fields exist.
- A recorded-only proof section describes evidence as recorded or simulated and does not use a completed external-action claim.
- Rehearsal artifact provenance detail includes the exact concept `labeled local rehearsal` while preserving the existing visible provenance type.
- `npm run build` and the relevant existing proof-package and artifact-model checks pass.
- No test files, GitHub records, Notion records, or external systems are changed.

## Scope

Writable:

- `C:\Users\heroi\Code\Workspace\Src\CoOps\src\evidence\proofPackage.ts`
- `C:\Users\heroi\Code\Workspace\Src\CoOps\src\artifacts\model.ts`
- `C:\Users\heroi\Code\Workspace\Src\CoOps\src\.factory\active\demo-proof-honesty-fixes\state.md`

Read-only dependencies:

- Existing runtime types, proof-package components, and tests

## Inputs

- Runtime/evidence audit findings and commands
- Existing `K_REVISION` fallback of `local`
- Existing artifact-model wording assertion

## Outputs

- Minimal production-code changes with command-backed verification in `state.md`
