# Contracts: bazel-git-lfs CLI

Command-line interface contracts for the `bazel-git-lfs` tool. These are the public interface of the CLI.

## Global

- Binary: `bazel-git-lfs`
- `bazel-git-lfs --help` — list all commands with usage.
- `bazel-git-lfs <command> --help` — command-specific help.
- `--json` (global, optional) — machine-readable JSON output for all commands.
- Exit codes: `0` success, `1` error/failure, `2` usage error.

## Command: init

```
bazel-git-lfs init [--config <path>]
```

Initializes local configuration (mirror repo URL, cache dir, git/lfs binary paths). Creates config file if absent; safe to re-run.

**Output**: confirmation of created/updated config location.

## Command: scan

```
bazel-git-lfs scan <project-dir> [--json]
```

Read-only discovery of remote HTTP dependencies. Never downloads or modifies anything.

**Output**: list of discovered dependencies with `name`, `urls`, `sha256`, `stripPrefix`, `sourceFile`. Empty result → success with empty list.

## Command: sync

```
bazel-git-lfs sync <project-dir>... [--cache-dir <dir>] [--no-push] [--json]
```

Discovers dependencies across one or more projects, downloads missing artifacts, verifies SHA256, caches, and mirrors to Git LFS. Dedups identical content across projects/URLs.

**Flags**: `--no-push` performs download+verify+cache+commit but skips push.

**Output**: per-artifact status (`already-mirrored` | `uploaded` | `skipped-duplicate` | `failed`), plus commit/push result. Failed verification is reported and NOT stored.

## Command: verify

```
bazel-git-lfs verify [--all] [--json]
```

Checks mirror artifacts against manifest/SHA256. Reports each artifact valid/corrupt.

**Output**: list of artifacts with validity; non-zero exit if any corrupt.

## Command: list

```
bazel-git-lfs list [--json]
```

**Output**: all mirrored artifacts and metadata from the manifest.

## Command: search

```
bazel-git-lfs search <keyword> [--json]
```

**Output**: artifacts matching the keyword (by name).

## Command: checkout

```
bazel-git-lfs checkout <project-dir> [--apply] [--json]
```

Rewrites Bazel `urls` from public to internal mirror URLs. **Dry-run by default**: prints proposed changes, modifies nothing. `--apply` writes changes to disk.

**Output (dry-run)**: proposed replacements, unchanged for deps not yet mirrored. **Output (apply)**: confirmation of files changed.

## Exit / error conventions

- Errors go to stderr; structured results (when `--json`) go to stdout.
- Any artifact failing SHA256 verification aborts that artifact's mirroring (G1) and is reported as `failed`.
- Missing system `git`/`git-lfs` → clear error with install guidance.