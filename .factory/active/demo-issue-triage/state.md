---
status: done
---

# Current state

## Verified results

- Audited `main` at `be83143`, which matches `origin/main`. The only untracked path was `.factory/`; this packet changed no repository code, GitHub record, Notion record, or external system.
- Read the current body, discussion, labels, state, formal parent relationship, formal sub-issues, linked closing pull requests, and pull-request cross-references for #54 through #66, #83, and #84. GitHub has no issue types, projects, milestones, or assignees on these issues. #54 is the formal parent of #55 through #66. #61 and #65 are closed; the others are open. #60 also names #72 through #75 in its body; all four are closed by #78 or #79.
- Current-source checks:
  - `npx tsc --noEmit -p tsconfig.json` passed at the repository root.
  - `npx tsc --noEmit -p tsconfig.json` passed from `server/`.
  - Running the 51 server tests directly from current TypeScript source passed 49. One assertion disagrees with the current rehearsal provenance wording, and one symlink test cannot create a Windows symlink under this host policy. Details are under material failures.
  - `npm run preflight` reached the running server and returned `NO-GO` on 2026-08-27. Local file, Cloud Storage, and YouTube publication failed because `COOPS_LOCAL_ROOTS`, `COOPS_GCS_BUCKET`, and a Google account are absent. The authority control passed by refusing no approval and a mismatched checksum, then releasing only the matching checksum.
- No local `.env` exists and the current process has none of `COOPS_LOCAL_ROOTS`, `COOPS_GCS_BUCKET`, the three Google OAuth variables, `GEMINI_API_KEY`, or `VITE_COMPANY`. `.env.example` is the only environment file.

### Issue classification

| Issue | Classification | Current evidence and remaining outcome |
|---|---|---|
| #54 GTM plan | Mixed tracker | Its formal children cover positioning, rehearsal, proof, assets, gates, and success. Repository mechanisms are mostly present, but the confirmed local demo entry mismatch, #84, and the external live and production work below keep the overall plan open. |
| #55 Launch objectives | Mixed | `README.md`, `docs/messaging.md`, `docs/architecture.md`, the typed event server, proof package, and live/rehearsal separation implement the product claim. A real multi-agent run, judge scoring, and published reusable launch material are not repository claims and remain external. |
| #56 Target audience | Locally represented; external proof outstanding | `docs/messaging.md` names the buyer roles and keeps the GTM lead as the story actor. The judge requirement for real Google Cloud execution depends on the live run and is currently NO-GO. |
| #57 Positioning | Locally complete | PR #70 is cross-referenced. `docs/messaging.md` records `federated agent operations`, the one-line position, and the unchanged tagline. The README and landing page carry the same position. |
| #58 Campaign narrative | Mixed | PR #76 added the Horse company and rehearsal. `src/demos/horse-launch/script.ts` expresses the Marketing to Engineering request, allow-listed discovery, staging, approval, and publication. `server/src/tools/launch.ts` and `server/src/brain/gemini.ts` own the real path. The default documented entry currently mounts that scenario against the wrong company. Real staging and publication remain external. |
| #59 Message hierarchy | Locally complete | PRs #70 and #71 are cross-referenced. `README.md`, `index.html`, `docs/architecture.md`, `docs/messaging.md`, and `docs/launch-copy.md` lead with the outcome and defer provider vocabulary. Both messaging tests passed from current source. Past-tense copy remains correctly gated on a real `GO`. |
| #60 Four-minute demo | Mixed | PRs #76, #77, and #79 are cross-referenced. #72 through #75 are closed. The script has camera cues, a three-step presenter, explicit simulated receipts, a named approval pause, restart, replay, and completion. The confirmed default-entry mismatch below prevents the documented zero-configuration path from showing the intended Engineering boundary. The four-minute recording itself is production work. |
| #61 Proof package | Complete | Closed by PR #67. `src/evidence/proofPackage.ts`, `src/components/ProofPackage.tsx`, launch receipts, and Activity expose the required evidence and refuse to mark dry runs as verified. All proof-package tests passed from current source. |
| #62 Launch assets | Mixed | Present locally: public repository instructions in `README.md`, Mermaid architecture and trust-boundary rules in `docs/architecture.md`, locked Devpost and social copy in `docs/launch-copy.md`, and `docs/assets/horse-valley-rehearsal.png`. Absent externally: a hosted application, flagship and trailer videos, published Devpost/article/social posts, logged-out link proof, and Google Cloud deployment proof. GitHub reports an empty homepage, no deployments, and no GitHub Pages configuration. The repository has no GIF, MP4, or WebM launch asset. |
| #63 Ready-to-use copy | Locally complete, publication gated | PR #71 is cross-referenced and `docs/launch-copy.md` contains the issue strings plus claim-to-receipt mapping. Publishing them is external and the document correctly forbids past-tense claims until preflight is `GO` and custody is `verified`. |
| #64 Execution schedule | Mixed | The claim, evidence design, copy, rehearsal, preflight, and preview exist. The real end-to-end run, repeated successful preflights, deployment freeze, recording, editing, captions, submission upload, public link checks, and social publication have no current proof. Those steps need credentials, accounts, an operator, or publication authority. |
| #65 Go/No-Go gates | Mechanism complete; live outcome blocked | PRs #68 and #80 implement the executable server gates and frontend panel; the issue is closed. Current preflight proves the approval control but returns `NO-GO` for local discovery, Cloud Storage, and YouTube. The four live checkboxes cannot truthfully be claimed complete yet. |
| #66 Success criteria | Locally supported; overall result unverified | The rehearsal and proof views expose the product, department boundary, autonomous steps, human gate, and evidence chain. Questions 5 and 6 require a real external action and receipt. A judge-watching-once result also depends on the finished recording, which does not exist in the repository. |
| #83 "needa fix ai slop" | Insufficient issue contract | The body is empty and there are no comments, labels, links, or acceptance conditions. PR #82, merged 46 seconds before the issue was opened, is titled as an anti-AI-slop overhaul and changed the current UI broadly, but GitHub does not link it to #83. The issue cannot be closed or converted into further work without the reporter naming a remaining visible defect or accepting the current design. |
| #84 light mode logo | Confirmed local gap | The issue asks for a transparent light-mode logo. `src/App.tsx:202` and `src/components/NavRail.tsx:45` both wrap the constellation in an opaque `bg-ink` tile. In light mode the wordmark therefore still has a dark square instead of the requested transparent mark. Those two files own the visible behavior; `public/favicon.svg` is separate browser chrome. |

### Ordered confirmed local work

1. Fix the Horse rehearsal and active-company mismatch under #58 and #60. The documented `Run rehearsal` button calls `openRehearsal()` without an id at `src/components/PersonaGate.tsx:115`. `src/engine/rehearsals.ts:51-66` sorts module paths and selects the first, which is `horse-launch`. At the same time, `.env.example:10` and `src/data/activeCompany.ts:8-9` default the app to Everpeak. Everpeak has no Engineering department (`src/data/companies/everpeak.ts:8-15`), while the Horse script sends the visible envelope to `engineering`, frames Marketing plus Engineering, and delegates to `op-engineering` and `w-connector` (`src/demos/horse-launch/script.ts:129-155`). Observable failure: following the README's default `Run rehearsal` path starts the horse story on an Everpeak map that cannot show the Engineering district or its connector ownership. These files own the entry choice and company binding: `src/components/PersonaGate.tsx`, `src/engine/rehearsals.ts`, `src/data/activeCompany.ts`, `.env.example`, and `README.md`.
2. Satisfy #84 in `src/App.tsx` and `src/components/NavRail.tsx`. Observable failure: light mode renders the constellation on an opaque dark tile instead of a transparent light-mode mark.

No new GitHub issue is recommended. #58/#60 already cover the demo-path mismatch and #84 already covers the logo. #83 needs a reporter decision rather than another vague issue.

### Genuinely external work

- Configure an allow-listed real video root, a writable Cloud Storage bucket, and Google OAuth for the correct YouTube channel. This is account and credential work, not repository code.
- Perform one end-to-end live run with the real file, named Marketing approval, Cloud Storage object, and returned YouTube video ID. Then require `npm run preflight` to return `GO` and the proof package to return `verified` before recording or publishing past-tense claims.
- Deploy and prove the hosted frontend and Cloud Run server. No current GitHub deployment record or public repository homepage identifies such a deployment.
- Record, edit, caption, upload, and publish the four-minute video, trailer, Devpost entry, technical article, and social posts. Test public links while logged out. These steps require operator choices and external publication authority.

## Decisions and material failures

- The current test suite has a source-contract disagreement introduced by the current UI. `src/artifacts/model.ts:75,88` labels rehearsal content `Demo template` and describes it as `Sample document from the local demo scenario.` The existing assertion at `server/src/test/artifact-model.test.ts:45` still requires the detail to contain `labeled local rehearsal`. The visible UI still labels the artifact as a demo template, so this audit does not claim the simulation boundary is broken. The coordinator must decide whether the exact detail wording is a required contract or the assertion is stale before changing either file.
- `server/src/test/launch-tools.test.ts` failed when Windows returned `EPERM` while creating the test symlink. Other launch-tool checks, including allow-list refusal with no root and publication refusal without a matching approval, passed. This is a host verification limitation, not evidence that the real-path containment logic failed. Re-run that case on a symlink-capable host or authorize a test-portability change before claiming all 51 tests pass.
- Historical PR verification is supportive, not the current source of truth. PR #82 says `npm run build` passed, but the current-source run above is the evidence used here.

## Current work

Audit complete. No implementation or external action was authorized for this packet.

## Unresolved

- #83 lacks any observable behavior or acceptance condition. Exact answer needed: which current screen or interaction still looks wrong, or whether PR #82 satisfies the report.
- The required Google account, bucket, local video root, named approver action, hosted deployment, and publication accounts are unavailable in this workspace.
- The artifact-detail wording contract and Windows symlink-test policy need coordinator decisions if the parent requires a fully passing current suite before proceeding.

## Next action

The coordinator should create separate implementation packets for the confirmed default Horse rehearsal mismatch and #84, with approval for their exact changes. In parallel only where external authority exists, an operator can configure the live services and run preflight. Do not record or publish the full launch claim until preflight reads `GO` and custody reads `verified`.

## Related packets

- Parent: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`
