---
status: done
---

# Current state

## Verified results

- Repository code and external systems remained read-only. Final `git status --short` shows only the coordinator-owned untracked `.factory/` tree.
- `npm run build` passed. TypeScript and the Vite production build completed; Vite reported only its existing chunk-size warning.
- `node --test server/dist/server/src/test/preflight.test.js server/dist/server/src/test/proof-package.test.js server/dist/server/src/test/run-evidence.test.js server/dist/server/src/test/spine.test.js` passed 36 of 36 checks. This covers all four preflight gates, live versus dry-run receipts, checksum mismatch handling, proof-package gaps, runtime identity, approval stamping, the HTTP spine, SSE resume, and scheduler cancellation.
- `node --test --test-name-pattern="discovery reads|unreachable Cloud Storage|publication is blocked|only an approved" server/dist/server/src/test/launch-tools.test.js` passed 4 of 4 selected launch-tool checks. The connector hashes the bytes it reads, a missing cloud connection yields a non-live dry-run receipt, publication refuses a missing or mismatched approval, and only the matching authority receipt unlocks publication.
- The complete server command `npm --prefix server test` compiled successfully and ran 51 checks: 49 passed and 2 failed. The two failures are recorded below.
- A server started with an isolated temporary data directory, mock brain, and no launch credentials answered `npm --prefix server run preflight -- http://localhost:18080` with `NO-GO`: `local-file` failed because `COOPS_LOCAL_ROOTS` was empty; `cloud-handoff` failed because `COOPS_GCS_BUCKET` was empty; `authority` passed its no-approval, wrong-checksum, and matching-checksum control; `publication` failed because no Google account was connected. The process was stopped after the check.
- The real-service path is explicit in current code:
  - `server/src/tools/launch.ts:52-86` discovers only under configured roots, hashes the file, and emits a live local-discovery receipt.
  - `server/src/tools/launch.ts:90-149` emits a non-live receipt when the bucket or token is absent. With both present it uploads, verifies MD5 and byte count, and emits the live Cloud Storage generation and checksum.
  - `server/src/brain/gemini.ts:356-401` constructs the proposed authority receipt from the staged SHA-256, title, privacy, and named approver. `POST /approvals/:eventId/decision` stamps the actual person and approval time in `server/src/http.ts:285-321`.
  - `server/src/tools/launch.ts:153-205` refuses publication without an authority receipt or when its checksum differs. A missing token yields a non-live publication receipt. A real `videos.insert` result becomes live only when it contains a video ID.
  - `server/src/preflight.ts:113-378` uses the same latest receipts, requires a live matching cloud handoff, exercises the approval control, and accepts publication proof only from a live successful receipt with a video ID.
  - `server/src/index.ts:172-182` reads Cloud Run's `K_REVISION`, defaulting to `local`; `/runtime` exposes this identity and `/preflight` exposes the gates through `server/src/http.ts:51-57`.
- Rehearsal evidence stays distinguishable from real evidence. `src/engine/rehearsals.ts:82-103` stamps every authored event with `simulated: true` and a rehearsal ID. All four horse receipts in `src/demos/horse-launch/artifacts.ts:93-154` have `live: false`, including the sample video ID `hR73xW9pQmA`. Folding those exact receipts through `readProofPackage` reported every external section as `recorded`, every section as `live: false`, and chain of custody as `incomplete` with `Checksums agree, but at least one step was recorded without touching the external system.` The UI reinforces this with `recorded only` and `no external system touched` in `src/components/ProofPackage.tsx:140-155`.
- Replay is a pure fold over task events, not evidence of another execution. A direct `buildReplayMapping` check compressed three 60-second gaps containing request, approval, and completion events into a 6.7-second wall-clock replay while preserving the final virtual timestamp. Ownership is `src/engine/replay.ts:17-47` and `src/store.ts:800-812`.

## Decisions and material failures

- Highest priority, truthful Cloud Run evidence has a locally fixable false-positive. A direct fold with live receipts and `runtimeInfo.execution: 'live'`, `revision: 'local'` returned `coopsStatus: 'verified'` and `complete: true`. `src/evidence/proofPackage.ts:203-232` treats any non-empty revision as complete and treats any live backend as a live CoOps section, while the visible field is named `Cloud Run revision`. A local server therefore can present `Cloud Run revision: local` inside a verified, complete package. The stable surfaces are `GET /runtime` and Activity -> Audit Package. Owners are `server/src/index.ts:172-182`, `src/evidence/proofPackage.ts:203-232`, and `src/components/ProofPackage.tsx`. The package should not call Cloud Run evidence verified unless the runtime identity proves Cloud Run, for example with a real `K_REVISION` under an explicit cloud runtime classification.
- High priority, the live approval endpoint does not resume the paused Gemini publication turn. `request_publication_approval` emits a `PermissionRequest` and ends the current turn after replying (`server/src/brain/gemini.ts:356-408`). The decision endpoint appends `ApprovalGranted`, but `onAppended` only invokes the brain for a person-to-agent `Chat` (`server/src/index.ts:159-165`). No continuation is registered for approval resolution. The stable interface `POST /approvals/:eventId/decision` therefore grants authority but does not by itself produce the later YouTube tool call; a second user chat is required. This conflicts with the documented pause-and-resume path and blocks a truthful live demonstration of automatic continuation. Owners are `server/src/brain/gemini.ts`, `server/src/http.ts`, and `server/src/index.ts`.
- High priority for the local rehearsal, the full server suite exposes a truth-label regression. `server/src/test/artifact-model.test.ts:37-46` requires rehearsal provenance detail to say `labeled local rehearsal`, but `src/artifacts/model.ts:81-90` currently returns `Sample document from the local demo scenario.` The command is `npm --prefix server test`; the failing check is `rehearsal metadata resolves to an explicitly labeled sample document`. The artifact still carries the `Demo template` label, but the required explicit provenance sentence no longer passes.
- Lower priority, the full server suite is not portable to this Windows host. `server/src/test/launch-tools.test.ts:47-65` calls `symlink` during fixture setup and fails with `EPERM` before the allow-list code is exercised. The selected launch checks pass, so this is test-fixture setup rather than observed connector behavior. The owning test should skip with a stated host reason or use a Windows-capable fixture while retaining the outside-root assertion.
- Real Cloud Storage, YouTube, named-human, and Cloud Run claims remain external requirements, not local failures. This audit had no credentials or authority to perform them, and the live preflight correctly refused to claim them.

## Current work

The bounded runtime and evidence audit is complete. No repository code, GitHub record, Notion page, or external service was changed.

## Unresolved

- A real end-to-end publication still needs an allow-listed local horse video, a writable `COOPS_GCS_BUCKET`, a connected Google account with the needed Storage and YouTube grants, a named human decision on the exact checksum, a returned YouTube video ID, and a Cloud Run deployment with a real `K_REVISION`.
- The coordinator must decide which locally fixable findings become implementation packets. This audit does not authorize those code or test changes.

## Next action

Return these findings to the parent. The smallest useful implementation order is: make Cloud Run proof impossible to verify as `local`; restore automatic live continuation after publication approval; restore the explicit rehearsal provenance sentence; then make the Windows symlink fixture portable if Windows is a supported check host.

## Related packets

- Parent: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`
