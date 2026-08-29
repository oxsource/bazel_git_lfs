# Contracts: bazel-git-lfs inspect (Stage 2 — Discovery)

Command-line interface contracts for Stage 2 (Discovery). This extends the Stage 1 CLI contract: the `scan` stub becomes the real `inspect` command, and a cache command is added.

## Global (from Stage 1)

- Binary: `bazel-git-lfs`
- `bazel-git-lfs --help` lists all commands.
- `bazel-git-lfs <command> --help` — command-specific help.
- Exit codes: `0` success, `1` error/failure, `2` usage error.
- Errors go to stderr; structured results (when `--json`) go to stdout.

## Command: inspect

```
bazel-git-lfs inspect [<project-dir>] [--json]
```

Read-only discovery of remote HTTP dependencies in a Bazel project. `project-dir` defaults to the current directory when omitted (FR-004). Never downloads, uploads, modifies, or caches anything (FR-003); only the cache command writes the snapshot.

**Prerequisite**: the project must have an initialized config area (`bazel-git-lfs init`). If not initialized, exit `1` with: `error: No config area found in <project-dir>. Run "bazel-git-lfs init" first.` (FR-008). A mirror profile is NOT required (SC-006 assumption).

**Parsing**: discovers `http_archive`/`http_file` rules via **file-content scanning** of `WORKSPACE`, `WORKSPACE.bazel`, `MODULE.bazel` **and any `.bzl` files they `load()`**, handling literal calls and `for`-loop/variable-based declarations (FR-001, FR-001a, FR-010). When the `bazel` binary is available, results are **cross-checked against `bazel query`** for the authoritative "actually used" external-repo set and dependency relationships (FR-011); otherwise `queryUsed: false` is reported.

**Output (human, default)**: a readable listing, one dependency per line, e.g.:

```
<name>  sha256=<sha256|->  <sourceFile>  <primary-url>
```

Plus a trailing summary line with the dependency count. Empty result prints `No HTTP dependencies found.` and exits `0` (FR-005).

**Output (`--json`)**: valid JSON to stdout:

```json
{
  "ok": true,
  "projectDir": "<project-dir>",
  "dependencies": [
    {
      "name": "abseil",
      "urls": ["https://github.com/abseil/abseil-cpp/archive/refs/tags/20250127.0.tar.gz"],
      "sha256": "<64-hex>",
      "stripPrefix": null,
      "sourceFile": "deps.bzl",
      "resolved": true
    }
  ],
  "warnings": [],
  "filesScanned": ["WORKSPACE", "MODULE.bazel", "deps.bzl"],
  "queryUsed": true,
  "queryExternalRepos": ["abseil", "protobuf"],
  "dependencyRelations": { "abseil": ["googletest"] }
}
```

## Command: cache

```
bazel-git-lfs cache [<project-dir>] [--json]
```

Persists the discovered dependency snapshot into the project's `.bazel_git_lfs/dependencies.json` (atomic write, FR-013) so later `list`/query reads are fast (FR-003a). Runs the same discovery as `inspect`; the only difference is it writes the snapshot.

**Prerequisite**: initialized config area (`init`); missing → exit `1` with the init-first error (FR-008). `.bazel_git_lfs` not writable → exit `1` with a clear error.

**Output**: confirmation of the snapshot path. With `--json`: `{ "ok": true, "snapshotPath": "<path>", "dependencyCount": <n> }`.

**Behavior**:
- Refreshes/overwrites an existing snapshot atomically (no partial/corrupt cache on interruption).
- Re-runnable safely (idempotent).

## Exit / error conventions (shared by inspect and cache)

- Project directory missing/unreadable → exit `1`, error to stderr.
- A Bazel file present but unparsable → exit `1`, error naming the file (FR-007).
- No `init` config area → exit `1` with the init-first error (FR-008).
- `.bazel_git_lfs` not writable (cache only) → exit `1`, clear error.
- Missing/unknown flags → exit `2` (usage).
- Unresolvable loop-generated declarations, missing `load()` targets, or Bazel-query unavailability are reported in `warnings` (and, with `--json`, as structured warnings) rather than silently dropped (FR-010/FR-011); the command still exits `0` for otherwise-fine results.

## Internal shared model

`discover/models.ts` exports `Dependency` and `ScanResult` (see `data-model.md`). These types are consumed by later stages (sync/verify/rewrite) and MUST remain backend-agnostic.
