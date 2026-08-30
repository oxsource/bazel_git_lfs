# checkout

## Purpose

`checkout` is a hybrid command. It intercepts special aliases with custom URL replacement logic, and passes through branch names to `git -C .bazel_git_lfs/objects checkout` followed by custom URL patching.

## Usage

```
bazel-git-lfs checkout <alias>
```

## Aliases

| Alias | Behavior |
|-------|----------|
| `default` or `--` | Custom URL replacement — restore original source URLs in Bazel files |
| `local` or `@` | Custom URL replacement — switch to `file://` paths under `.bazel_git_lfs/objects/` |
| `<branch>` | `git -C .bazel_git_lfs/objects checkout <branch>` then custom URL replacement/patch |

## Examples

```bash
# Restore to original source URLs
bazel-git-lfs checkout default

# Switch to local file paths
bazel-git-lfs checkout local

# Git checkout a branch + apply URL patches
bazel-git-lfs checkout feature-branch
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Checkout completed successfully |
| 1 | Error |

## Notes

- `checkout` writes changes directly to Bazel files
- A pre-commit hook (installed by `init`) automatically runs `checkout default` before commits
- The command is idempotent — re-running with the same alias produces no changes