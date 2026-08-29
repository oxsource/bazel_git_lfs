# CLI Contracts: status / clean

JSON-only stdout; errors are `{ "ok": false, "error": "..." }` on stdout with non-zero exit.
Exit codes: `0` success, `1` failure, `2` usage error.
Both commands require an initialized config area (`init`). `status` additionally requires the mirror working clone to be available (via `init` + a prior `inspect`/`fetch`/`push` is not strictly required — the command reads the manifest from the working clone, which is created on first `push`/`pull`).

## Command: status

```text
bazel-git-lfs status [--sha256-prefix <hex>] [--source-url <substring>] [<keyword>]
```

Checks every artifact in the mirror manifest against its stored object's SHA256. Streaming, memory-bounded. Optional filters narrow the set of artifacts checked.

**Flags**:
- `--sha256-prefix <hex>` — case-insensitive prefix match on SHA256.
- `--source-url <substring>` — case-insensitive substring match on `sources[]`.
- `<keyword>` — positional; case-insensitive substring match across artifact name (derived from source URL), mirror path, and source URLs.

**Success output** (`exit 0`):

```json
{
  "ok": true,
  "command": "status",
  "results": [
    { "sha256": "ab12…", "path": "com/github/foo/bar/ab12…", "status": "valid" },
    { "sha256": "cd34…", "path": "com/example/beta/cd34…", "status": "valid" }
  ],
  "summary": { "total": 2, "valid": 2, "corrupt": 0, "missing": 0 },
  "filters": null
}
```

Filtered output includes `filters`:

```json
{
  "ok": true,
  "command": "status",
  "results": [
    { "sha256": "ab12…", "path": "com/github/foo/bar/ab12…", "status": "valid" }
  ],
  "summary": { "total": 1, "valid": 1, "corrupt": 0, "missing": 0 },
  "filters": { "sha256Prefix": "ab12", "sourceUrl": null, "keyword": null }
}
```

**Failure output** (`exit 1`):

```json
{
  "ok": false,
  "command": "status",
  "results": [
    { "sha256": "ef56…", "path": "com/github/foo/bad/ef56…", "status": "corrupt", "expected": "ef56…", "actual": "deadbeef…" },
    { "sha256": "ab12…", "path": "com/github/foo/missing/ab12…", "status": "missing" }
  ],
  "summary": { "total": 2, "valid": 0, "corrupt": 1, "missing": 1 },
  "error": "1 corrupt, 1 missing artifact(s) in the mirror"
}
```

## Command: clean

```text
bazel-git-lfs clean
```

Removes the local objects store, mirror working clone, and dependency snapshot. Preserves the config file and `.gitignore` entry. Idempotent.

**Success output** (`exit 0`):

```json
{
  "ok": true,
  "command": "clean",
  "removed": { "objects": true, "mirror": true, "snapshot": true }
}
```

When some paths are already absent:

```json
{
  "ok": true,
  "command": "clean",
  "removed": { "objects": false, "mirror": true, "snapshot": false }
}
```

## Usage-error contract (both commands)

Extra arguments or unknown options → usage error, `exit 2`, JSON `{ "ok": false, "error": "unknown option '--x' / unexpected argument '<arg>'" }` (consistent with Stages 2–3).

## Mirror manifest contract

Unchanged from Stage 3 (contracts/cli.md). `status` reads the same manifest that `push` writes.