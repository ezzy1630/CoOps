---
status: done
---

# Current state

## Verified results

- Removed the seeded `w-horse` entry from `BASE_AGENTS` in `src/data/companies/horse.ts`. The existing `AgentSpawned` event in `src/demos/horse-launch/script.ts` is now the sole origin of the Horse Launch Agent identity.
- `npm run build` passed after the change. Vite built 5,034 modules; the existing main-chunk size warning did not fail the build.
- `git diff --check -- src/data/companies/horse.ts` passed. This packet changed no test or external record and did not touch sibling packet files.
- Browser QA used the Horse company in explicit rehearsal mode against the local Vite server:
  - Before starting the demo, the Agents page listed 12 agent headings and zero `Horse Launch Agent` headings. The Marketing department panel also showed only one seeded specialist, Campaign Copy Agent.
  - The complete launch-day rehearsal reached blueprint approval, emitted the `AgentSpawned` worker, routed `Locate launch video on developer export` to Engineering, staged the receipt, paused for Maya Chen, recorded approval, and reached `Rehearsal complete: publication result recorded`.
  - After completion, the Agents page showed `All (13)`, `Marketing 3`, and exactly one `Horse Launch Agent` heading. Its room showed the completed cross-department task history.
  - `View inheritance diff` opened exactly one `Configuration inheritance` panel for Horse Launch Agent, with the expected Marketing owner, blueprint purpose, Engineering collaborator, scoped tools, approval, and limits.
  - The complete-run browser console contained zero warnings and zero errors. Filtering specifically for `w-horse`, `inh-w-horse`, unique-key, or duplicate-key messages returned no entries.
- The QA tab was closed and the local Vite service was stopped after verification.

## Decisions and material failures

- The identity must originate from the creation event because the demo claims the blueprint creates this worker. Keeping a seed identity and deduplicating downstream would hide the incorrect lifecycle and leave pre-approval UI behavior wrong.

## Current work

Implementation and verification complete.

## Unresolved

- None.

## Next action

Return the verified one-file production change to the parent coordinator. No further work is authorized in this packet.

## Related packets

- Parent: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`
