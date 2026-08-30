# Research: Mirror Upstream Flow

## Architecture Decision: Interception/Passthrough

### Decision
Use a command interception registry pattern. `bazel-git-lfs` registers exactly four custom commands (`init`, `inspect`, `clean`, `checkout`). All other `bazel-git-lfs <args>` transparently delegate to `git -C .bazel_git_lfs/objects <args>`.

### Rationale
- Minimal code changes: existing custom logic for transfer/, mirror/, objects/ is replaced by standard git operations
- Maximum flexibility: users can run any git command on the inner repo via passthrough
- Merge-Request workflow: the inner `.bazel_git_lfs/objects/` repo is a standard git repo with LFS, supporting branch/push/pull/fetch/remote naturally
- Simpler testing: git commands are well-tested; we only need to test our interception and hooks

### Interception Flow
```
bazel-git-lfs <cmd> <args>
  → interceptor.lookup(cmd)
  → if registered: run custom handler
  → if not registered: git -C .bazel_git_lfs/objects <cmd> <args>
     (with optional pre-hooks like upstream check)
```

## Upstream Remote Validation

### Decision
Use `git -C .bazel_git_lfs/objects ls-remote <remote>` to verify the upstream remote exists and is reachable before fetch/push/pull passthrough.

### Rationale
- `git ls-remote` is a lightweight Git command that tests SSH/HTTPS connectivity without transferring data
- Works with any Git server
- Returns non-zero exit code on failure

## Branch Naming Convention

### Decision
Parse the remote URL to extract `<group>/<reponame>`, then suggest `<group>_<reponame>_<feature>`.

### Remote URL formats supported
- SSH: `git@github.com:group/repo.git` → group=group, repo=repo
- HTTPS: `https://github.com/group/repo.git` → group=group, repo=repo
- Git: `git://github.com/group/repo.git` → group=group, repo=repo
- File: `file:///path/to/repo` → skip suggestion

## Init Flow

```
bazel-git-lfs init
1. mkdir -p .bazel_git_lfs/
2. mkdir .bazel_git_lfs/objects/
3. cd .bazel_git_lfs/objects/ && git init
4. git -C .bazel_git_lfs/objects lfs track "*"  (or specific patterns)
5. Add .bazel_git_lfs/ to .gitignore (if not already present)
6. Install pre-commit hook (existing behavior)
```

## Config Persistence

### Decision
The existing `config.json` format is preserved. The `upstream` concept is now fully managed by the inner `.bazel_git_lfs/objects/.git` repo's git remote and branch tracking. The `config.json` only stores profiles and aliases for the outer CLI.

### Rationale
- Git's built-in remote and branch tracking replaces the need for custom upstream config storage
- `git -C .bazel_git_lfs/objects remote -v` shows all remotes
- `git -C .bazel_git_lfs/objects branch -vv` shows tracking branches

## Files to Modify

### New files:
- `src/cli/interceptor.ts` — Interception registry with passthrough logic
- `src/hooks/checkout.ts` — Checkout hybrid handler (custom for `--`/`@`, git passthrough + patch for `<branch>`)

### Modified files:
- `src/cli/index.ts` — Add interceptor, remove direct command registrations for passthrough commands
- `src/cli/init.ts` — Add `mkdir objects` and `git init` steps
- `src/cli/clean.ts` — Adapt to remove entire `.bazel_git_lfs/` directory
- `src/cli/checkout.ts` — Rewrite as hybrid handler in interceptor

### Files to remove/simplify:
- `src/transfer/fetch.ts` — Replaced by passthrough
- `src/transfer/push.ts` — Replaced by passthrough  
- `src/transfer/pull.ts` — Replaced by passthrough
- `src/mirror/repository.ts` — Replaced by inner git repo
- `src/mirror/manifest.ts` — Replaced by git history
- `src/mirror/lfs.ts` — Simplified (only used for ls-remote checks)
- `src/objects/store.ts` — Replaced by git LFS
- `src/cli/fetch.ts` — Removed, passthrough
- `src/cli/push.ts` — Removed, passthrough
- `src/cli/pull.ts` — Removed, passthrough
- `src/cli/remote.ts` — Removed, passthrough
- `src/cli/status.ts` — Removed, passthrough
- `src/cli/checkout.ts` — Replaced by hybrid in interceptor
- `src/cli/push-pull.ts` — Removed