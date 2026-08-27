# Demo Git scope review

## Source

- Kind: local
- Record: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`

## Outcome

Audit what should and should not enter the demo branch, with special attention to factory packets, generated files, secrets, and unrelated edits.

## Completion

- Classify every changed or untracked path as product deliverable, durable factory state, generated artifact, secret risk, or unrelated change.
- Check repository ignore conventions and recent commit conventions.
- Recommend the exact inclusion or exclusion policy for commits.
- Identify any content that must be scrubbed before committing.

## Scope

Writable:

- `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\demo-git-scope-review\state.md`

Read-only dependencies:

- `C:\Users\heroi\Code\Workspace\Src\CoOps`

## Inputs

- Current status, full diff, ignore rules, and recent repository history.

## Outputs

- Evidence-backed commit scope policy in `state.md`.
