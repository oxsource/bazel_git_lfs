# CLI Contracts: fetch / pull / push

JSON-only stdout; errors are `{ "ok": false, "error": "..." }` on stdout with non-zero exit.
Exit codes: `0` success (including zero-dependency / all-cached / nothing-to-push), `1` failure, `2` usage error.
All three commands take **no arguments and no flags** (except `--help`); extra arguments are a usage error (exit 2).
All commands require: initialized config area (`init`), and the persisted snapshot (`inspect`). `pull` and `push` additionally require a configured effective default remote profile.

## Command: fetch

```text
bazel-git-lfs fetch
```

Downloads snapshot dependencies from their declared origin URLs into `.bazel_git_lfs/objects/` (Maven-style layout), verifying SHA256 while streaming. No mirror involved.

**Success output** (`exit 0`):

```json
{
  "ok": true,
  "command": "fetch",
  "projectDir": "/abs/project",
  "objectsDir": "/project/.bazel_git_lfs/objects",
  "results": [
    { "name": "react", "sha256": "ab12…", "status": "fetched" },
    { "name": "gmock", "sha256": "cd34…", "status": "cached" }
  ],
  "summary": { "total": 2, "fetched": 1, "cached": 1, "failed": 0 }
}
```

**Failure** (any dependency failed; partial results are still reported, `exit 1`):

```json
{
  "ok": false,
  "command": "fetch",
  "projectDir": "/abs/project",
  "objectsDir": "/project/.bazel_git_lfs/objects",
  "results": [
    { "name": "bad", "sha256": "ef56…", "status": "failed", "reason": "hash-mismatch" },
    { "name": "nosum", "sha256": null, "status": "failed", "reason": "missing-sha256" }
  ],
  "summary": { "total": 2, "fetched": 0, "cached": 0, "failed": 2 },
  "error": "1 dependency failed during fetch"
}
```

`reason` values: `hash-mismatch` | `missing-sha256` | `network` | `no-url-succeeded` | `store-error`.
URL fallback: a dependency's `urls` are tried in order; the first URL that yields a hash-valid artifact wins.

**Fatal errors** (`exit 1`, no `results`):

- not initialized: `Not a valid bazel_git_lfs project: <dir>. Run "bazel-git-lfs init" first.`
- missing snapshot: `no dependency snapshot, run "bazel-git-lfs inspect" first`

## Command: push

```text
bazel-git-lfs push
```

Pure local→remote transport: uploads locally present snapshot objects to the configured default mirror via system git/git-lfs, merges `manifest.json`, commits and pushes. Never downloads from origin.

**Per-dependency statuses**: `uploaded` | `already-mirrored` | `missing-local` | `failed` (`reason`: `store-error` | `git-error`).
`missing-local` is informational: remaining objects are still pushed and `missing-local` alone does **not** cause `exit 1` (FR-009).

**Success output** (`exit 0`):

```json
{
  "ok": true,
  "command": "push",
  "projectDir": "/abs/project",
  "remote": { "alias": "default", "url": "ssh://git@gitlab.example.com/mirror.git" },
  "commit": "3f9c1ab…",
  "pushed": true,
  "results": [
    { "name": "react", "sha256": "ab12…", "status": "uploaded", "path": "com/github/facebook/react/ab12…" },
    { "name": "gmock", "sha256": "cd34…", "status": "already-mirrored" },
    { "name": "local-missing", "sha256": "ef00…", "status": "missing-local" }
  ],
  "summary": { "total": 3, "uploaded": 1, "already-mirrored": 1, "missing-local": 1, "failed": 0 }
}
```

`pushed: false` with `commit: null` when nothing changed (no commit created — idempotent re-push).

**Failure** (`exit 1`): git/clone/push errors are reported as JSON errors including git's stderr summary; missing default profile: `No mirror configured. Run "bazel-git-lfs init" and "bazel-git-lfs remote add" first.`

## Command: pull

```text
bazel-git-lfs pull
```

Mirror-only transfer: resolves snapshot dependencies against the mirror manifest, materializes objects via `git lfs pull --include`, verifies SHA256 on arrival, stores into the local objects store. Never contacts origin URLs.

**Success output** (`exit 0`):

```json
{
  "ok": true,
  "command": "pull",
  "projectDir": "/abs/project",
  "objectsDir": "/project/.bazel_git_lfs/objects",
  "remote": { "alias": "default", "url": "ssh://git@gitlab.example.com/mirror.git" },
  "results": [
    { "name": "react", "sha256": "ab12…", "status": "pulled" },
    { "name": "gmock", "sha256": "cd34…", "status": "cached" }
  ],
  "summary": { "total": 2, "pulled": 1, "cached": 1, "not-in-mirror": 0, "failed": 0 }
}
```

**Failure** (any `not-in-mirror` or `failed`; `exit 1`):

```json
{
  "ok": false,
  "command": "pull",
  "projectDir": "/abs/project",
  "remote": { "alias": "default", "url": "ssh://git@gitlab.example.com/mirror.git" },
  "results": [
    { "name": "never-pushed", "sha256": "ef56…", "status": "not-in-mirror",
      "reason": "not-in-mirror",
      "message": "mirror lacks object ef56…; an upstream project must push it" }
  ],
  "summary": { "total": 1, "pulled": 0, "cached": 0, "not-in-mirror": 1, "failed": 0 },
  "error": "1 dependency not found in the mirror"
}
```

**Fatal errors** (`exit 1`): same as fetch plus missing default profile (FR-012).

## Usage-error contract (all three commands)

Extra arguments or unknown options → usage error, `exit 2`, JSON `{ "ok": false, "error": "unknown option '--x' / unexpected argument '<arg>'" }` (consistent with Stage 2's `inspect`).

## Mirror manifest contract (`manifest.json` at the mirror root)

```json
{
  "version": 1,
  "updatedAt": "2026-08-29T12:00:00.000Z",
  "objects": {
    "ab12…": {
      "path": "com/github/facebook/react/ab12…",
      "sources": ["https://github.com/facebook/react/releases/download/v1.2/x.tar.gz"],
      "firstSeenAt": "2026-08-29T12:00:00.000Z"
    }
  }
}
```

- Keyed by SHA256; `sources` unions across pushes (same content, different URLs → one entry, many sources).
- Objects + manifest change in the same git commit (FR-020).
- Consumed by Stage 4 (`verify`/`list`/`search`) — schema version field enables future evolution.
