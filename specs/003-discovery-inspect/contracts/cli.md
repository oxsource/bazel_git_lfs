# Contracts: bazel-git-lfs inspect (Stage 2 — Discovery)

Command-line interface contracts for Stage 2 (Discovery). This extends the Stage 1 CLI contract: the `scan` stub becomes the real `inspect` command, which persists the dependency snapshot itself (there is no separate cache command).

## Global (from Stage 1)

- Binary: `bazel-git-lfs`
- `bazel-git-lfs --help` lists all commands.
- `bazel-git-lfs <command> --help` — command-specific help.
- Exit codes: `0` success, `1` error/failure, `2` usage error.
- Errors go to stderr; structured results (when `--json`) go to stdout. `inspect` deviates: all of its output — results and errors — is JSON on stdout.

## Command: inspect

```
bazel-git-lfs inspect
```

Discovery of the **current project's** remote HTTP dependencies. The command takes **no arguments and no flags** (JSON is the only output format; extra arguments or unknown options are a usage error, exit `2`).

**Prerequisite**: the current project must have an initialized config area (`bazel-git-lfs init`). If not initialized, exit `1` with the JSON error: `{ "ok": false, "error": "Not a valid bazel_git_lfs project: <dir>. Run \"bazel-git-lfs init\" first." }` (FR-008). A mirror profile is NOT required (SC-006 assumption).

**Behavior**: discovers `http_archive`/`http_file` rules via **file-content scanning** of `WORKSPACE`, `WORKSPACE.bazel`, `MODULE.bazel` **and any `.bzl` files they `load()`**, handling literal calls and `for`-loop/variable-based declarations (FR-001, FR-001a, FR-010). When the `bazel` binary is available, results are **cross-checked against `bazel query`** for the authoritative "actually used" external-repo set and dependency relationships (FR-011); otherwise `queryUsed: false` is reported. On success, the result is persisted to `.bazel_git_lfs/dependencies.json` (atomic write, refresh/overwrite, FR-003a/FR-013) — `inspect` writes nothing else.

**Output (JSON, only format)**: valid JSON to stdout:

```json
{
  "ok": true,
  "projectDir": "<current-dir>",
  "snapshotPath": "<current-dir>/.bazel_git_lfs/dependencies.json",
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

**Output (error)**: exit `1`, JSON error object on stdout:

```json
{ "ok": false, "error": "Cannot parse Bazel file: WORKSPACE" }
```

## Exit / error conventions (inspect)

- Not initialized (`init` missing) → exit `1`, JSON error `Not a valid bazel_git_lfs project: <dir>. Run "bazel-git-lfs init" first.` (FR-008).
- A Bazel file present but unparsable → exit `1`, JSON error naming the file (FR-007).
- A Bazel file present but unreadable → exit `1`, JSON error naming the file (FR-007).
- `.bazel_git_lfs` not writable → exit `1`, JSON error with a clear message.
- Extra arguments or unknown options → exit `2` (usage error to stderr, from Commander).
- Unresolvable loop-generated declarations, missing `load()` targets, or Bazel-query unavailability are reported in `warnings` as structured warnings rather than silently dropped (FR-010/FR-011); the command still exits `0` for otherwise-fine results.

## Internal shared model

`inspect/models.ts` exports `Dependency` and `InspectResult` (see `data-model.md`). These types are consumed by later stages (sync/verify/rewrite) and MUST remain backend-agnostic.
