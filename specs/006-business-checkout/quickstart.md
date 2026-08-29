# Quickstart: Business Project Checkout

Switch your Bazel project's dependency URLs between different sources: original, local, or remote mirror.

## Prerequisites

- An initialized project (`bazel-git-lfs init`) with a configured remote profile.
- A populated mirror (at least one `fetch` + `push` cycle, or a `pull` from a teammate).
- The project must have a WORKSPACE or MODULE.bazel file with `http_archive`/`http_file` dependencies.

## 1. Restore to original source URLs

```bash
cd my-bazel-project
bazel-git-lfs checkout default
```

Restores all dependency URLs back to their original source URLs as recorded in the mirror manifest. Idempotent — no changes if already at default.

## 2. Switch to local file paths

```bash
bazel-git-lfs checkout local
```

Rewrites URLs to local file:// paths under `.bazel_git_lfs/objects/`. Useful for offline builds or when the mirror is unreachable.

## 3. Switch to a remote mirror

```bash
bazel-git-lfs checkout production
bazel-git-lfs checkout staging
```

Rewrites URLs to the remote URL configured for the given profile alias. The alias must be a configured profile (added via `bazel-git-lfs remote add --alias <name>`).

## 4. Shorthand forms

```bash
bazel-git-lfs checkout --     # same as checkout default
bazel-git-lfs checkout @      # same as checkout local
```

## Quickstart validation

```bash
# after init + remote + inspect + fetch + push in a project:
bazel-git-lfs checkout production    # switches URLs to mirror
bazel-git-lfs checkout default       # restores URLs to original
bazel-git-lfs checkout local         # switches to local file:// paths
bazel-git-lfs checkout default       # restores again (idempotent)