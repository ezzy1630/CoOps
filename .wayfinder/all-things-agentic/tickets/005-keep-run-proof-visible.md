---
title: Keep run proof in view
label: wayfinder:task
parent: ../map.md
status: closed
assignee: codex
---

## Question

How can the frontend make operational proof obvious without covering the Company Map or turning the shell into a dashboard?

## Acceptance

- Primary navigation uses recognizable product icons instead of placeholder letters.
- The unused rail space reports events, tasks, Artifacts, guardrails, and the active runtime.
- Activity and the rail read the same evidence model.
- Secondary views load on demand with stable skeleton layouts.
- The initial production chunk stays below Vite's 500 kB warning threshold.

## Resolution

`src/evidence/runEvidence.ts` owns the shared frontend read model. The rail links directly to Activity and stays visible on Map, Approvals, Agents, and Documents. Route and panel splitting reduced the initial production chunk from 596.56 kB to 486.64 kB while preserving the established navigation and interaction paths.
