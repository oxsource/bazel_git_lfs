# CLI Contracts: verify / list / search / clean

JSON-only stdout; errors are `{ "ok": false, "error": "..." }` on stdout with non-zero exit.
Exit codes: `0` success, `1` failure, `2` usage error.
All four commands take **no arguments and no flags** (except `--help` and `list`'s optional filter flags); extra arguments are a usage error (exit 2).
All commands require an initialized config area (`init`). `verify`, `list`, and `search` additionally require the mirror working clone to be available (via `init` + a prior `inspect`/`fetch`/`push` is not strictly required — the commands read the manifest from the working clone, which is created on first `push`/`pull`).

## Command: verify

```text
bazel-git-lfs verify
```

Checks every artifact in the mirror manifest against its stored object's SHA256. Streaming, memory-bounded.

**Success output** (`exit 0`):

```json
{
  "ok": true,
  "command": "verify",
  "results": [
    { "sha256": "ab12…", "path": "com/github/foo/bar/ab12…", "status": "valid" },
    { "sha256": "cd34…", "path": "com/example/beta/cd34…", "status": "valid" }
  ],
  "summary": { "total": 2, "valid": 2, "corrupt": 0, "missing": 0 }
}
```

**Failure output** (`exit 1`):

```json
{
  "ok": false,
  "command": "verify",
  "results": [
    { "sha256": "ef56…", "path": "com/github/foo/bad/ef56…", "status": "corrupt", "expected": "ef56…", "actual": "deadbeef…" },
    { "sha256": "ab12…", "path": "com/github/foo/missing/ab12…", "status": "missing" }
  ],
  "summary": { "total": 2, "valid": 0, "corrupt": 1, "missing": 1 },
  "error": "1 corrupt, 1 missing artifact(s) in the mirror"
}
```

## Command: list

```text
bazel-git-lfs list [--sha256-prefix <hex>] [--source-url <substring>]
```

Outputs all manifest entries, optionally filtered.

**Flags**:
- `--sha256-prefix <hex>` — case-insensitive prefix match on SHA256.
- `--source-url <substring>` — case-insensitive substring match on `sources[]`.

**Success output** (`exit 0`):

```json
{
  "ok": true,
  "command": "list",
  "artifacts": [
    { "sha256": "ab12…", "path": "com/github/foo/bar/ab12…", "sources": ["https://github.com/foo/bar/v1.2.tar.gz"], "firstSeenAt": "2026-08-29T00:00:00.000Z" }
  ],
  "total": 1,
  "filters": null
}
```

Filtered output includes `filters`:

```json
{
  "ok": true,
  "command": "list",
  "artifacts": [...],
  "total": 1,
  "filters": { "sha256Prefix": "ab12", "sourceUrl": null }
}
```

## Command: search

```text
bazel-git-lfs search <keyword>
```

Case-insensitive substring match across artifact name (derived from source URL), mirror path, and source URLs. `<keyword>` is required (usage error without it).

**Success output** (`exit 0`):

```json
{
  "ok": true,
  "command": "search",
  "keyword": "abseil",
  "artifacts": [
    { "sha256": "ab12…", "path": "com/github/google/abseil/ab12…", "sources": ["https://github.com/google/abseil/…"], "firstSeenAt": "2026-08-29T00:00:00.000Z" }
  ],
  "total": 1
}
```

Empty result:

```json
{
  "ok": true,
  "command": "search",
  "keyword": "nonexistent",
  "artifacts": [],
  "total": 0
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

## Usage-error contract (all four commands)

Extra arguments or unknown options → usage error, `exit 2`, JSON `{ "ok": false, "error": "unknown option '--x' / unexpected argument '<arg>'" }` (consistent with Stages 2–3).

## Mirror manifest contract

Unchanged from Stage 3 (contracts/cli.md). `verify` / `list` / `search` read the same manifest that `push` writes.