---
status: done
---

# Current state

## Verified results

- The repository is on `main` tracking `origin/main` at `be83143`; the review did not change branches, the index, commits, or product files.
- `git status --short --branch` shows 15 modified product/documentation paths and one untracked `.factory/` tree. The `.factory/` tree is coordinator state and is excluded from the proposed product commits.
- The complete product diff was inspected: `.env.example`, `README.md`, `server/src/brain/gemini.ts`, `server/src/brain/types.ts`, `server/src/index.ts`, `src/App.tsx`, `src/artifacts/model.ts`, `src/components/NavRail.tsx`, `src/components/PersonaGate.tsx`, `src/components/ProofPackage.tsx`, `src/data/activeCompany.ts`, `src/data/companies/horse.ts`, `src/demos/horse-launch/script.ts`, `src/evidence/proofPackage.ts`, and `src/store.ts`.
- `git diff --check` passed for the combined working-tree diff.
- `npm run build` passed against the combined diff. TypeScript compiled, Vite transformed 5,034 modules, and the only output warning was the existing large main-chunk advisory.
- Sibling packet evidence confirms the server suite has 50 passing checks and one Windows-only symlink-fixture `EPERM` failure before product code runs. The relevant continuation, evidence, and launch-tool checks pass.

### Proposed commit series

1. `feat(demo): make Horse Launch Co the default rehearsal`

   Paths:

   - `.env.example`
   - `README.md`
   - `src/App.tsx`
   - `src/components/NavRail.tsx`
   - `src/components/PersonaGate.tsx`
   - `src/data/activeCompany.ts`
   - `src/data/companies/horse.ts`
   - `src/demos/horse-launch/script.ts`

   This commit keeps the flagship rehearsal internally consistent: Horse Launch Co is the zero-configuration company, the opening names the missing-video permission boundary, the scripted route reaches the cross-department work promptly, the worker is created only by its blueprint event, rehearsal publication copy is explicit about simulation, and both wordmarks work on a transparent background. The README and env example describe the same launch path.

2. `fix(audit): scope rehearsal evidence and reject unverifiable proof`

   Paths:

   - `src/artifacts/model.ts`
   - `src/components/ProofPackage.tsx`
   - `src/evidence/proofPackage.ts`

   This commit makes the Audit Package use only the newest authored rehearsal and its task events, labels rehearsal provenance as a labeled local rehearsal, prevents a local runtime from counting as Cloud Run proof, and prevents recorded-only sections from claiming completed external actions. It should follow commit 1 so the audit text and the scripted receipts agree.

3. `feat(server): resume approved live publications`

   Paths:

   - `server/src/brain/types.ts`
   - `server/src/index.ts`
   - `server/src/brain/gemini.ts`

   These three paths must land together. The interface adds the optional continuation, the durable approval handler invokes it once for a checksum-matching live authority, and Gemini performs the existing YouTube operation while reporting success only for a live receipt with a video ID. Splitting them would leave the callback contract or its caller/implementation incomplete. This commit is independent of the frontend commits but follows them in the proposed series for a readable demo history.

4. `fix(replay): preserve the completed world after replay`

   Path:

   - `src/store.ts`

   This isolated fix changes replay toggling so pausing or automatically finishing at the final frame does not reset the replay clock to zero. It can be applied independently after the demo and audit behavior.

## Decisions and material failures

- This packet is review-only and must not stage, commit, modify product files, or change branches.
- The proposed grouping follows delivered behavior rather than packet chronology. The Horse Launch Agent seed removal belongs with the default rehearsal because it fixes that rehearsal's identity lifecycle. The audit paths stay together because they jointly determine what the proof modal can claim. The server paths stay atomic because they form one callback contract.
- Do not include `.factory/` in product commits. It is untracked coordinator/worker state, and this packet owns only its own `state.md`.
- The current branch is the repository default branch. Branch transition is handled by the sibling branch-review packet; this review intentionally leaves Git state unchanged.

## Current work

Commit decomposition and dependency review are complete. No commits or workspace changes were made.

## Unresolved

- The coordinator must apply the sibling branch recommendation before staging this series. The Windows symlink-fixture failure remains an existing portability issue, not a reason to alter the proposed product commits.

## Next action

Move the work to the approved dedicated branch, then stage and verify the four commits in the listed order. Keep `.factory/` out of those commits unless the coordinator separately decides how factory state should be archived.

## Related packets

- Parent: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`
