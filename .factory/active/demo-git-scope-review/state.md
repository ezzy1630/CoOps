---
status: done
---

# Current state

## Verified results

- Repository state at review time: `HEAD` is `be83143`, `main`, exactly aligned with `origin/main`; `origin/HEAD` resolves to `origin/main`. The current working branch is therefore the repository default branch, not a dedicated demo branch. This packet did not change branches, the index, commits, or product files.
- `git diff --check` passes for the complete tracked diff.
- There are 15 modified tracked paths and 28 untracked packet files. No other untracked product path appears in `git status --short --untracked-files=all`.
- The recent history uses focused conventional commit subjects and pull-request merge commits. The current demo work should retain explicit path selection and should not be committed directly on `main`.
- `.gitignore` ignores `node_modules`, `dist`, `.DS_Store`, `server/data`, `server/dist`, and `.agents/memory`. It does not ignore `.factory`, `.env`, `*.tsbuildinfo`, logs, or coverage output. `git log --all -- .factory` is empty and `git ls-files '.factory/**'` returns no tracked factory files.
- The changed `.env.example` contains only blank credential slots. A scan of the tracked diff and all active packet files found no non-empty API key, token, password, bearer credential, or private-key block. The sample YouTube ID in the rehearsal script is fixture data and is explicitly described as simulated.

## Decisions and material failures

- Inclusion policy for the demo product change set: include exactly the 15 modified tracked paths listed below. They form one causally related local horse-launch demo result: entry/company selection, UI copy and branding, rehearsal behavior, proof semantics and scoping, replay restoration, and live approval continuation.
- Exclusion policy for the demo product change set: exclude every `.factory/active/**` path listed below. These files are durable factory coordination state, not product deliverables. Keep them in the active packet workspace; do not mix them into a demo feature commit. If the repository later adopts versioned factory metadata, that requires a separate explicit policy and metadata-only commit.
- Exclusion policy for generated or local operational artifacts: exclude ignored `.agents/`, `dist/`, `server/dist/`, `node_modules/`, and any `server/data/` contents, plus any future logs, coverage output, or build-info output such as `tsconfig.tsbuildinfo`. The current status has no changed or untracked generated artifact. `tsconfig.tsbuildinfo` is tracked in history but unchanged in this review.
- Secret handling: no current changed or untracked content needs scrubbing. Never stage a future `.env` or any populated credential file. Because `.env` is not covered by the current ignore rules, the coordinator must use explicit path staging or obtain separate approval for an ignore-rule change.
- Unrelated-change policy: none of the 15 current tracked modifications is unrelated to the completed horse-launch demo according to the diff and packet evidence. Any later edit outside this exact list is out of scope until re-reviewed.
- Branch finding: because the work is currently on default `main`, the coordinator must first create or select a dedicated non-default demo branch while preserving the working tree. No commit should be made from this packet on `main`.

### Exact tracked inclusion list

Each path below is a product deliverable and is included in the demo scope:

- `.env.example`  Product configuration and safe default Horse template; no populated secret.
- `README.md`  Product run instructions and truthful rehearsal/proof wording.
- `server/src/brain/gemini.ts`  Live approved-publication continuation.
- `server/src/brain/types.ts`  Brain adapter continuation contract.
- `server/src/index.ts`  Durable approval-event routing and de-duplication.
- `src/App.tsx`  Active-company entry copy and transparent wordmark.
- `src/artifacts/model.ts`  Explicit labeled local-rehearsal provenance text.
- `src/components/NavRail.tsx`  Transparent light-mode brand mark.
- `src/components/PersonaGate.tsx`  Horse launch entry story and permission-boundary copy.
- `src/components/ProofPackage.tsx`  Current rehearsal event/task scoping.
- `src/data/activeCompany.ts`  Horse as the default company template.
- `src/data/companies/horse.ts`  Removal of the duplicate seeded Horse Launch Agent.
- `src/demos/horse-launch/script.ts`  Prompt, timing, and truthful simulated publication path.
- `src/evidence/proofPackage.ts`  Verification-only completion and recorded/live claim semantics.
- `src/store.ts`  Replay play/pause restoration behavior.

### Exact untracked factory-state exclusion list

Each path below is durable factory state and is excluded from the demo product commit:

- `.factory/active/complete-coops-demo/deliverables.md`
- `.factory/active/complete-coops-demo/state.md`
- `.factory/active/demo-agent-identity-fix/deliverables.md`
- `.factory/active/demo-agent-identity-fix/state.md`
- `.factory/active/demo-approval-resume/deliverables.md`
- `.factory/active/demo-approval-resume/state.md`
- `.factory/active/demo-audit-scope-qa/deliverables.md`
- `.factory/active/demo-audit-scope-qa/state.md`
- `.factory/active/demo-git-branch-review/deliverables.md`
- `.factory/active/demo-git-branch-review/state.md`
- `.factory/active/demo-git-commit-review/deliverables.md`
- `.factory/active/demo-git-commit-review/state.md`
- `.factory/active/demo-git-scope-review/deliverables.md`
- `.factory/active/demo-git-scope-review/state.md`
- `.factory/active/demo-issue-triage/deliverables.md`
- `.factory/active/demo-issue-triage/state.md`
- `.factory/active/demo-live-production/deliverables.md`
- `.factory/active/demo-live-production/state.md`
- `.factory/active/demo-proof-honesty-fixes/deliverables.md`
- `.factory/active/demo-proof-honesty-fixes/state.md`
- `.factory/active/demo-replay-restore-fix/deliverables.md`
- `.factory/active/demo-replay-restore-fix/state.md`
- `.factory/active/demo-runtime-evidence/deliverables.md`
- `.factory/active/demo-runtime-evidence/state.md`
- `.factory/active/demo-ui-rehearsal/deliverables.md`
- `.factory/active/demo-ui-rehearsal/state.md`
- `.factory/active/demo-visible-flow-fixes/deliverables.md`
- `.factory/active/demo-visible-flow-fixes/state.md`

## Current work

Review complete. The exact inclusion and exclusion policy is recorded above. The only file this packet changed is its own `state.md`, as authorized.

## Unresolved

- The coordinator still needs to move the shared worktree from default `main` to a dedicated non-default demo branch before staging or committing the included paths.
- Whether `.factory` should ever be versioned is a repository-owner decision. This review excludes it from the demo product commits because no factory files are tracked in history and the active files are orchestration state.

## Next action

The parent coordinator should use the exact tracked inclusion list after creating a dedicated branch, inspect the final diff for newly introduced paths, and stage only the approved product paths. Preserve all active packet files outside the product commit.

## Related packets

- Parent: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`
