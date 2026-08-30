# CLI Contract: Mirror Upstream Flow

## Interception/Passthrough

```
bazel-git-lfs <command> [args...]

Registered (custom):
  init       Create .bazel_git_lfs/ → mkdir objects → git init with LFS
  inspect    Scan Bazel dependencies, write snapshot
  clean      Remove entire .bazel_git_lfs/ directory
  checkout   Hybrid: --/@ use custom logic; other args → git passthrough + patch

Passthrough (→ git -C .bazel_git_lfs/objects <command> <args>):
  fetch      git fetch (with pre-hook upstream check)
  push       git push (with pre-hook upstream check)
  pull       git pull (with pre-hook upstream check)
  remote     git remote (with post-hook branch suggestion)
  status     git status
  log        git log
  branch     git branch
  add        git add
  commit     git commit
  ...        any other git command
```

## New Flags (passthrough pre-hook handling)

### fetch / push / pull

```
bazel-git-lfs fetch [options] [git-fetch-args...]
bazel-git-lfs push [options] [git-push-args...]
bazel-git-lfs pull [options] [git-pull-args...]

Options (intercepted before passthrough):
  --remote <name>       upstream remote name (overrides configured default)
  --branch <name>       upstream branch name (overrides configured default)

All other args pass through to git unchanged.
```

## Checkout (Custom Hybrid Command)

```
bazel-git-lfs checkout <alias>

Alias:
  -- / default   → custom URL replacement: restore original source URLs in project files
  @ / local      → custom URL replacement: switch to file:// local paths in project files
  <branch>       → 1) git -C .bazel_git_lfs/objects checkout <branch>
                   2) custom URL replacement/patch on project Bazel files
```

## Upstream Health Check Messages

```
# No remote configured
> bazel-git-lfs fetch
No upstream configured. Use --remote <name> to specify, or run:
  git -C .bazel_git_lfs/objects remote add <name> <url>

# Remote unreachable
> bazel-git-lfs push
Upstream remote 'origin' (git@github.com:oxsource/mirror.git) is unreachable.
Check the URL and network connectivity.

# Remote reachable
> bazel-git-lfs pull
(passthrough to git -C .bazel_git_lfs/objects pull ...)
* branch main -> FETCH_HEAD
```

## Branch Suggestion Messages

```
> bazel-git-lfs remote add mymirror git@github.com:oxsource/bazel_git_lfs.git
( git -C .bazel_git_lfs/objects remote add mymirror git@github.com:oxsource/bazel_git_lfs.git )
✓ Remote 'mymirror' added
? Bind upstream? › y/N
? Suggested branch format: oxsource_bazel-git-lfs_<feature>
```