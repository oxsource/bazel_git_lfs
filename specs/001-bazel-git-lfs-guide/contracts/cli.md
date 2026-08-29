# Contracts: bazel-git-lfs CLI

Command-line interface contracts for the `bazel-git-lfs` tool. These are the public interface of the CLI.

## Global

- Binary: `bazel-git-lfs`
- `bazel-git-lfs --help` — list all commands with usage.
- `bazel-git-lfs <command> --help` — command-specific help.
- JSON-only commands output to stdout; errors are `{ "ok": false, "error": "..." }` on stdout with non-zero exit.
- Exit codes: `0` success, `1` error/failure, `2` usage error.

## Command: init

```
bazel-git-lfs init [--json]
```

Creates `.bazel_git_lfs/` config area, updates `.gitignore`, installs pre-commit hook. Non-interactive. Safe to re-run.

**Output**: confirmation of created config location.

## Command: remote

```
bazel-git-lfs remote add [--global] [--alias <name>] [--url <url>] [--json]
bazel-git-lfs remote set-default <alias> [--global] [--json]
bazel-git-lfs remote remove <alias> [--global] [--json]
bazel-git-lfs remote list [--global] [--effective] [--json]
bazel-git-lfs remote alias add <name> <url> [--json]
bazel-git-lfs remote alias list [--json]
bazel-git-lfs remote alias remove <name> [--json]
```

Manages mirror-repository profiles. Project-local by default; `--global` for user-wide scope. `--effective` shows merged config. Alias names reject reserved keywords (`local`).

## Command: inspect

```
bazel-git-lfs inspect
```

Read-only discovery of remote HTTP dependencies. Never downloads or modifies anything. JSON-only output.

**Output**: list of discovered dependencies with `name`, `urls`, `sha256`, `stripPrefix`, `sourceFile`. Empty result → success with empty list.

## Command: fetch

```
bazel-git-lfs fetch
```

Downloads snapshot dependencies from their source URLs into the local objects store. SHA256 verified. JSON-only output.

**Output**: per-artifact status (`fetched` | `cached` | `failed`).

## Command: push

```
bazel-git-lfs push
```

Uploads local objects to the configured Git LFS mirror, updates the manifest, commits and pushes. JSON-only output.

**Output**: per-artifact status (`uploaded` | `already-mirrored` | `missing-local` | `failed`).

## Command: pull

```
bazel-git-lfs pull
```

Transfers snapshot dependencies from the configured Git LFS mirror into the local objects store. Mirror-only, never origin. JSON-only output.

**Output**: per-artifact status (`pulled` | `cached` | `not-in-mirror` | `failed`).

## Command: status

```
bazel-git-lfs status [--sha256-prefix <hex>] [--source-url <substring>] [<keyword>]
```

Checks every mirrored artifact's SHA256 against the manifest. Streaming, memory-bounded. Reports valid/corrupt/missing. JSON-only output.

**Output**: `{ results: [{ sha256, path, status, expected?, actual? }], summary: { total, valid, corrupt, missing } }`. Non-zero exit when any artifact is corrupt or missing.

## Command: clean

```
bazel-git-lfs clean
```

Removes local objects store, mirror working clone, and dependency snapshot. Preserves config file and `.gitignore`. Idempotent. JSON-only output.

**Output**: `{ removed: { objects: boolean, mirror: boolean, snapshot: boolean } }`.

## Command: checkout

```
bazel-git-lfs checkout <alias>
```

Rewrites Bazel `urls` based on the alias. `default`/`--` restores original source URLs. `local`/`@` starts a local HTTP server on port 8022 and rewrites to `http://127.0.0.1:8022/`. A named profile alias switches to that alias's remote URL. Direct write — no dry-run mode. JSON-only output.

**Output**: `{ alias, target, changes: [{ file, dependency, before, after }], changed, unchanged }`.

## Pre-commit hook

Installed by `init` at `.git/hooks/pre-commit`. Checks `.bazel_git_lfs/checkout-state.json`; if a non-default checkout is detected, runs `checkout default` to restore original URLs before the commit proceeds.

## Exit / error conventions

- Errors go to stdout as JSON `{ "ok": false, "error": "..." }` with non-zero exit.
- Any artifact failing SHA256 verification aborts that artifact's mirroring (G1) and is reported as `failed`.
- Missing system `git`/`git-lfs` → clear error with install guidance.