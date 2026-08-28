# Demo Git branch review

## Source

- Kind: local
- Record: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`

## Outcome

Determine the correct base branch and dedicated working branch for the completed CoOps demo changes without mutating shared Git state.

## Completion

- Identify the current branch, upstream, divergence, and whether any user commits or pre-existing changes could be displaced.
- Recommend an exact branch name and safe command sequence for moving the existing work off the default branch.
- Identify branch or worktree risks that the coordinator must handle.

## Scope

Writable:

- `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\demo-git-branch-review\state.md`

Read-only dependencies:

- `C:\Users\heroi\Code\Workspace\Src\CoOps`

## Inputs

- Root factory packet and current Git repository state.
- Factory coordinator branch and commit protocol.

## Outputs

- Evidence-backed branch recommendation and safe transition steps in `state.md`.
