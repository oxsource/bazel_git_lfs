# Contracts: bazel-git-lfs scan (Stage 2 — Discovery)

Command-line interface contracts for Stage 2 (Discovery). This extends the Stage 1 CLI contract: the `scan` stub becomes a real command.

## Global (from Stage 1)

- Binary: `bazel-git-lfs`
- `bazel-git-lfs --help` lists all commands.
- `bazel-git-lfs <command> --help` — command-specific help.
- Exit codes: `0` success, `1` error/failure, `2` usage error.
- Errors go to stderr; structured results (when `--json`) go to stdout.

## Command: scan

```
bazel-git-lfs scan [<project-dir>] [--json]
```

Read-only discovery of remote HTTP dependencies in a Bazel project. `project-dir` defaults to the current directory when omitted (FR-004). Never downloads, uploads, modifies, or caches anything (FR-003).

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

**Exit / error conventions**:
- Project directory missing/unreadable → exit `1`, error to stderr.
- A Bazel file present but unparsable → exit `1`, error naming the file (FR-007).
- No `init` config area → exit `1` with the init-first error (FR-008).
- Missing/unknown flags → exit `2` (usage).
- Unresolvable loop-generated declarations, missing `load()` targets, or Bazel-query unavailability are reported in `warnings` (and, with `--json`, as structured warnings) rather than silently dropped (FR-010/FR-011); the scan still exits `0` for otherwise-fine results.

## Internal shared model

`discover/models.ts` exports `Dependency` and `ScanResult` (see `data-model.md`). These types are consumed by later stages (sync/verify/rewrite) and MUST remain backend-agnostic.
