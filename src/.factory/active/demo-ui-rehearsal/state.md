---
status: done
---

# Current state

## Verified results

- Ran the frontend and event server, opened the application in Chrome through its user-facing URL, selected **Run rehearsal**, followed the horse-launch path to completion, opened Activity, inspected the task trace and Audit Package, and ran Replay.
- The core task path completed without a runtime failure. The task trace showed 13 events over 48 seconds: request, Marketing to Engineering request, Engineering acceptance, delegation to Developer Machine Connector, local scan, discovery manifest, Cloud Storage staging, staging receipt, named publication gate, Maya Chen approval, YouTube call, publication receipt, and completion.
- Replay opened from the completed task and played the 48 seconds of work as a 17-second replay with a scrubber and pause control. The browser console had no warnings or errors during the run.
- The Audit Package reported 28 of 30 fields recorded and `Chain of custody: incomplete`. Every receipt section said `recorded only` and `no external system touched`. The missing CoOps fields were Run ID and Cloud Run revision. This is an honest rehearsal boundary when read in the package.
- Issue #66 is only partly satisfied by the visible path. The task trace answers what ran autonomously and where Maya retained control. The generic entry screen states the departmental-agent idea. The default-company mismatch and contradictory publication copy make the need for Engineering, the external-action answer, and the proof answer harder to understand.
- The run remained explicitly labeled `REHEARSAL` and `Deterministic local scenario` in the header. The entry notice also said no backend, model, or external system is used.

## Decisions and material failures

- No functional blocker was found. The path completes, the approval checkpoint resolves, the publication receipt appears, the Audit Package opens, and Replay works.
- **Priority 1, wrong company is mounted for the advertised default run.**
  - Reproduction: start the app with the README commands and no `VITE_COMPANY`, open the root URL, then select **Run rehearsal**.
  - Expected: the horse-launch rehearsal should run inside one consistent company with visible Marketing and Engineering ownership, so the permission boundary is obvious.
  - Observed: the breadcrumb and map say `Everpeak Outfitters`, Maya is labeled `Marketing Manager`, and the default Everpeak map has no Engineering department. The horse task still emits events for Engineering and the Developer Machine Connector, while its receipt names `Horse Launch Co (launch channel)`. A judge sees a task crossing into a department that is absent from the displayed company.
  - Why it matters: this weakens issue #60's Marketing to Engineering beat and issue #66 questions 2 and 7.
  - Owning files: `src/data/activeCompany.ts`, `src/data/companies/everpeak.ts`, `src/data/companies/horse.ts`, and `src/demos/horse-launch/artifacts.ts`. The stable launch instructions are in `README.md` and `package.json`.
- **Priority 1, the visible opening does not deliver the first 30 seconds in issue #60.**
  - Reproduction: load the root URL and select **Run rehearsal**.
  - Expected: 0:00 to 0:15 should show the horse dating app and missing-video crisis; 0:15 to 0:30 should state the Marketing versus Engineering permission boundary; 0:30 to 0:45 should show one GTM request.
  - Observed: the entry screen says `Every department gets an autonomous agent team` and contains no horse, missing video, laptop, YouTube, or permission-boundary copy. After the click, the request appears, but the UI spends about 20 seconds on a four-question agent-creation interview before proposing a blueprint. The cross-department task starts only after that blueprint resolves.
  - Why it matters: a presenter can narrate the missing beats, but a judge watching the application once cannot derive the cold open or the permission boundary from the first 30 seconds.
  - Owning files: `src/components/PersonaGate.tsx` and `src/demos/horse-launch/script.ts`.
- **Priority 1, rehearsal copy contradicts its honest external-action boundary.**
  - Reproduction: finish the rehearsal, open **Activity**, then open **Audit Package**.
  - Expected: the answer to issue #66 question 5 should be unambiguous. In rehearsal, no external action actually happened.
  - Observed: Activity says `Launch video is live (private-ready)` and `YouTube: videos.insert published`. The YouTube proof section says `The external publication happened and returned a real video id.` The same modal says `recorded only`, `no external system touched`, and `Chain of custody: incomplete`.
  - Why it matters: the status pills tell the truth, but the stronger result sentences make a simulated video ID look real unless the judge notices the smaller labels.
  - Owning files: `src/demos/horse-launch/script.ts`, `src/evidence/proofPackage.ts`, and `src/components/ProofPackage.tsx`.
- **Priority 2, the evidence segment loses the horse task in unrelated activity.**
  - Reproduction: complete the rehearsal and open **Activity**.
  - Expected: issue #60 allocates 2:50 to 3:35 to evidence, replay, and infrastructure proof, so the just-completed run should be immediately inspectable.
  - Observed: Activity opens on 150 all-company events. Ambient Everpeak tasks keep arriving and push the horse completion and receipts down the table. The horse trace is complete once its row is found, and Replay works, but there is no selected-task or rehearsal filter. **System Checks** then says `Start the server and refresh` even while the server is running. In rehearsal mode the refresh button cannot fetch a report because the rehearsal reset clears the report and live-only code guards the fetch.
  - Why it matters: the proof exists, but the presenter must hunt for it during the shortest part of the script. The System Checks message also misdiagnoses the intentional rehearsal boundary as a stopped server.
  - Owning files: `src/store.ts`, `src/data/scenarios.ts`, `src/components/ActivityPanel.tsx`, and `src/components/PreflightPanel.tsx`.

## Current work

Audit complete. No repository code, test, GitHub, Notion, or other external record was changed.

## Unresolved

- None for this audit. The coordinator must decide which findings become implementation work.

## Next action

Return these findings to the parent packet. If implementation is authorized later, address the company mismatch and external-action wording before presentation polish because they change what a judge concludes from the run.

## Related packets

- Parent: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`
