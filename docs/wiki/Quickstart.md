# Quickstart

This quickstart walks you through the complete `bazel-git-lfs` workflow. By the end, you will have an inner git repository managing your Bazel dependency mirrors.

## Prerequisites

- [[Installation|Install]] `bazel-git-lfs` (global install or npx)
- `git` and `git-lfs` installed on your system
- A Bazel project with `http_archive` or `http_file` dependencies

## 1. Initialize

```bash
cd /path/to/your/project
bazel-git-lfs init
```

This creates `.bazel_git_lfs/` → `mkdir objects` → `git init` in objects with Git LFS enabled. Adds `.bazel_git_lfs/` to `.gitignore`.

## 2. Inspect Dependencies

```bash
bazel-git-lfs inspect
```

Scans your Bazel files for HTTP dependencies and writes the snapshot to `.bazel_git_lfs/dependencies.json`. Re-run is cached — use `-f` to force re-scan.

## 3. Add a Mirror Remote

```bash
bazel-git-lfs remote add origin git@github.com:my-org/mirror.git
```

Passthrough to `git -C .bazel_git_lfs/objects remote add`. After success, you'll see a branch naming suggestion: `my-org_mirror_<feature>`.

## 4. Fetch/Push/Pull (Passthrough)

All operate on the inner git repo at `.bazel_git_lfs/objects/`:

```bash
bazel-git-lfs fetch origin
bazel-git-lfs push origin main
bazel-git-lfs pull origin
```

## 5. Checkout URL Sources

```bash
# Restore to original source URLs
bazel-git-lfs checkout --

# Switch to local file:// paths (offline work)
bazel-git-lfs checkout @

# Git checkout a branch + apply URL patches
bazel-git-lfs checkout <branch>
```

## 6. Clean

```bash
bazel-git-lfs clean
```

Removes the entire `.bazel_git_lfs/` directory.

## Next Steps

- See [[Commands]] for the full command reference
- See [[Configuration]] for profile and alias setup
- See [[Troubleshooting]] for common issues