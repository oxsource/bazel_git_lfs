# Quickstart: Mirror Consumption (verify / list / search / clean)

Query, audit, and reset the mirror after it has been populated.

## Prerequisites

- An initialized project (`bazel-git-lfs init`) with a configured remote profile.
- A populated mirror (at least one `fetch` + `push` cycle, or a `pull` from a teammate).

## 1. Verify mirror integrity

```bash
cd my-bazel-project
bazel-git-lfs verify
```

Checks every artifact in the mirror against its recorded SHA256. Corrupt or missing artifacts are reported individually with expected and actual hashes. Exit code is non-zero when any artifact is corrupt or missing.

## 2. List and search the mirror

```bash
bazel-git-lfs list                          # all artifacts
bazel-git-lfs list --sha256-prefix ab12     # filter by SHA256 prefix
bazel-git-lfs list --source-url github.com  # filter by source URL
bazel-git-lfs search react                  # search by keyword
```

All output is JSON. `list --sha256-prefix` and `--source-url` are case-insensitive substring matches. `search` matches across the artifact name (derived from source URL), mirror path, and source URLs.

## 3. Reset local state (for testing / recovery)

```bash
bazel-git-lfs clean
```

Removes the local objects store, the LFS working clone, and the dependency snapshot. The remote profile configuration (`.bazel_git_lfs/config.json`) is preserved — re-run `inspect` → `fetch` → `push` to repopulate from scratch without re-configuring the remote.

## Quickstart validation

```bash
# after init + remote + inspect + fetch + push in a project:
bazel-git-lfs verify      # all artifacts valid → exit 0
bazel-git-lfs list        # all artifacts returned
bazel-git-lfs search alpha # matches the artifact whose URL contains "alpha"
bazel-git-lfs clean       # state removed, config preserved
bazel-git-lfs inspect     # still works (snapshot recreated)
bazel-git-lfs fetch       # re-downloads from origin
```