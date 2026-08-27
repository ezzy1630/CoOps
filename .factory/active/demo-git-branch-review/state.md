---
status: done
---

# Current state

## Verified results

- The worktree is on `main` at `be831436551b16888f9d37d2f060dc88fac03d20` (`be83143`), and `main` tracks `origin/main`.
- `git rev-list --left-right --count main...origin/main` is `0 0`; there are no local-only or remote-only commits. `origin/HEAD` resolves to `origin/main`.
- `git status --porcelain=v2 --branch` reports no staged changes and 15 unstaged tracked paths: `.env.example`, `README.md`, the three `server/src` files, and 10 `src` files covering the completed demo behavior. `git diff --check` reports no whitespace errors.
- The parent packet records that the repository had no pre-existing working-tree changes when this work was accepted. The current tracked diff is therefore the parent packet's uncommitted result, not a user commit that would be displaced. The untracked `.factory/` tree is packet state and must not be swept into a product commit without the scope review's decision.
- No local or remote ref named `codex/complete-coops-demo` exists, and the only worktree is this checkout on `main`.
- Recommended base branch: `main` at the synchronized `origin/main` commit above. Recommended dedicated working branch: `codex/complete-coops-demo`, matching the parent packet slug and the repository's established `codex/` convention.

## Decisions and material failures

- This packet is review-only and must not change branches, commits, the index, product files, or other packet files.
- The branch transition must be performed by the coordinator after all other writers stop. Creating a branch in this shared checkout while another worker edits it could capture a partial result or cause later edits to land on the wrong ref.
- Do not reset, stash-and-drop, clean, or force-update `main`. A new branch created from the current `main` preserves the dirty worktree; the coordinator should commit only the paths approved by the separate scope and commit reviews.

## Current work

Review complete. The coordinator still owns the Git transition and product commits.

## Unresolved

- None for this review. The coordinator must stop and re-review if the synchronization check, candidate-ref absence check, or working-tree inventory changes before transition.

## Next action

After pausing all shared-worktree writers, run this sequence from the repository root. The checks are preconditions, not cleanup steps:

```powershell
git fetch origin
git status --short --branch
if ((git rev-list --left-right --count main...origin/main) -ne "0`t0") { throw "main is not synchronized with origin/main; stop and reconcile" }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw "staged changes exist; stop and identify their owner" }
if (git show-ref --verify --quiet refs/heads/codex/complete-coops-demo) { throw "candidate local branch already exists; stop and inspect it" }
if (git show-ref --verify --quiet refs/remotes/origin/codex/complete-coops-demo) { throw "candidate remote branch already exists; stop and inspect it" }
git switch -c codex/complete-coops-demo main
git status --short --branch
```

The final status must show `## codex/complete-coops-demo` with the same intentional worktree paths. Only then should the coordinator apply the approved commit-scope plan and push with `git push -u origin codex/complete-coops-demo`.

## Related packets

- Parent: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`
- Sibling commit-scope review: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\demo-git-scope-review`
- Sibling commit decomposition review: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\demo-git-commit-review`
