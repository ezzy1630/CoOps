---
title: Deepen the artifact trust spine
label: wayfinder:task
parent: ../map.md
status: closed
assignee: codex
---

## Question

How should the Artifact module make live content, rehearsal templates, metadata-only deliveries, and real external locations impossible to confuse across Documents, Activity, and the artifact viewer?

## Acceptance

- One deep module owns Artifact provenance and external-location rules.
- Live deliveries without content never render an invented document.
- Rehearsal templates stay useful and carry an explicit label.
- External actions render only when the event includes a valid URL.
- Activity exposes run evidence without changing primary navigation.
- Focused tests cover the module interface.

## Resolution

`src/artifacts/model.ts` is the deep module. Documents, Activity, and the artifact viewer consume its record instead of inferring provenance independently. Metadata-only live deliveries show an explicit unavailable state, rehearsal artifacts keep their sample documents and label, and external actions render only for validated HTTP or HTTPS locations. Activity also exposes runtime, event, task, tool, human-gate, artifact, and guardrail evidence without changing primary navigation.

The frontend build passed. The server suite passed 16 tests, including four focused Artifact record tests. Fresh browser checks covered the revised entry, rehearsal run evidence, Documents provenance, the artifact viewer, and the connected live runtime identity.
