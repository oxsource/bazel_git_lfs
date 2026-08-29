# CLI Contracts: checkout

JSON-only stdout when `--json` is specified; human-readable by default. Errors are `{ "ok": false, "error": "..." }` on stdout with non-zero exit.
Exit codes: `0` success, `1` failure, `2` usage error.
Requires an initialized config area (`init`). `checkout default` additionally requires the mirror working clone to be available.

## Command: checkout

```text
bazel-git-lfs checkout <alias>
```

Rewrites `urls` declarations in Bazel project files (WORKSPACE/MODULE.bazel) to point at the target source determined by the alias.

**Alias values**:
- `default` or `--` — restore to original source URLs from the mirror manifest.
- `local` or `@` — switch to local file:// paths under `.bazel_git_lfs/objects/`.
- `<profile-alias>` — switch to that alias's configured remote URL.

**Success output** (`exit 0`):

```json
{
  "ok": true,
  "command": "checkout",
  "alias": "default",
  "target": "original",
  "changes": [
    { "file": "WORKSPACE", "dependency": "abseil", "before": "https://mirror.example.com/abseil/1.0.tar.gz", "after": "https://github.com/abseil/abseil-cpp/archive/1.0.tar.gz" }
  ],
  "changed": 1,
  "unchanged": 2
}
```

**Idempotent output** (no changes needed):

```json
{
  "ok": true,
  "command": "checkout",
  "alias": "default",
  "target": "original",
  "changes": [],
  "changed": 0,
  "unchanged": 3
}
```

## Usage-error contract

Extra arguments or unknown alias → usage error, `exit 2`, JSON `{ "ok": false, "error": "…" }` (consistent with Stages 2–4).

## Reserved alias validation

`remote add` and `remote alias add` reject reserved aliases:

```json
{ "ok": false, "error": "\"default\" is a reserved alias and cannot be used as a profile name" }
```

## Pre-commit hook contract

The hook installed by `init`:
- Reads `.bazel_git_lfs/checkout-state.json`. If absent or containing `"alias": "default"`, exits 0 (no-op).
- Otherwise runs `bazel-git-lfs checkout default --json` in the project root.
- If checkout returns changes, prints the confirmation summary to stdout.
- If checkout fails (non-zero exit), prints the error and exits non-zero (blocks commit).

## Mirror manifest contract

Unchanged from Stage 3 (contracts/cli.md). `checkout default` reads the same manifest that `push` writes.