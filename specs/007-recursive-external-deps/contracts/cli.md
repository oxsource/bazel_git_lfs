# CLI Contract: Recursive External Dependency Discovery & Checkout

**Feature**: 007-recursive-external-deps | **Date**: 2026-08-30

All output remains JSON-only on stdout (project convention). Existing commands keep their names, arguments, and previous fields — the fields below are **additions** unless noted.

## `inspect`

**Behavior (extended)**: discovers dependencies declared inside loaded external repositories by resolving `@repo//...` loads (sandbox first, download fallback second), depth-first with first-encounter ownership; reports divergent re-declarations as conflicts.

**Exit codes**:

| Code | Condition |
|------|-----------|
| 0 | Success without conflicts (warnings allowed). |
| 1 | Init missing, snapshot write failure, or **`hasConflicts: true`** (FR-007). |

**Output additions**:

```json
{
  "ok": true,
  "projectDir": "...",
  "snapshotPath": "...",
  "dependencies": [
    {
      "name": "openssl",
      "urls": ["https://example.org/openssl.tar.gz"],
      "sha256": "abc...",
      "stripPrefix": "openssl-1.2",
      "sourceFile": "@B//tools:deps.bzl",
      "resolved": true,
      "origin": "external-bzl",
      "fromRepo": "B",
      "loadChain": ["@B//:setup.bzl", "@B//tools:deps.bzl"],
      "alsoLoadedBy": [["@D//:extra.bzl"]]
    }
  ],
  "warnings": ["cannot resolve load @X//missing.bzl: repository not in working area and download refused (no declared sha256)"],
  "conflicts": [
    {
      "repo": "C",
      "adopted": { "sourceFile": "@B//tools:deps.bzl", "urls": ["..."], "sha256": "...", "stripPrefix": "..." },
      "divergent": { "sourceFile": "@D//extra.bzl", "urls": ["..."], "sha256": "...", "stripPrefix": "..." },
      "differingFields": ["urls"]
    }
  ],
  "hasConflicts": false,
  "filesScanned": ["WORKSPACE", "@B//:setup.bzl", "@B//tools:deps.bzl"],
  "queryUsed": true,
  "queryExternalRepos": ["B", "C", "D"],
  "dependencyRelations": {}
}
```

Notes:
- `filesScanned` includes scanned external bzl files by their load-target label.
- Dependencies with `origin: "entry"` keep the previous shape plus the new default fields.
- Conflicts are reported **in addition to** normal output; the snapshot is still written (flagged).

## `checkout <alias>`

**Behavior (extended)**: in addition to Stage 5 project-tree URL rewriting, external-bzl dependencies are switched via patch injection: one audit patch per external repository under the config area plus a marker-tagged `patch_cmds` command merged into the repository's entry-file declaration. Conflicted repositories abort the run (FR-015); unresolvable repositories are skipped with warnings (FR-016).

**Exit codes**:

| Code | Condition |
|------|-----------|
| 0 | Success (changes or no-op), including skipped-unresolvable warnings. |
| 1 | Init missing, manifest missing for target, **conflicted repository detected**, or patch-write failure. |
| 2 | Usage errors (unchanged: missing/extra arguments). |

**Output additions**:

```json
{
  "ok": true,
  "command": "checkout",
  "alias": "local",
  "target": "local",
  "changes": [
    { "file": "WORKSPACE", "dependency": "zlib", "before": "https://...", "after": "http://127.0.0.1:8022/..." }
  ],
  "patches": [
    {
      "repo": "B",
      "patchFile": "patches/B.patch",
      "injectedIn": "WORKSPACE",
      "changes": [
        { "file": "@B//tools:deps.bzl", "dependency": "openssl", "before": "https://...", "after": "http://127.0.0.1:8022/..." }
      ]
    }
  ],
  "skipped": [
    { "repo": "X", "reason": "repository content unresolved at checkout time (no sandbox match, download refused)" }
  ],
  "changed": 1,
  "unchanged": 0,
  "error": null
}
```

Notes:
- `changes` continues to cover project-tree rewrites only; external-declaration rewrites appear under `patches[].changes`.
- `checkout default` reports removed injections in `patches` (with `changes` describing the removal summary) and deletes audit patch files; after restore the `patches` array lists what was removed.
- Idempotency: re-running with the same alias yields `patches[].changes` with `before == after` and no duplicate injected commands.
- Pre-existing Stage 5 fields (`ok`, `command`, `alias`, `target`, `changes`, `changed`, `unchanged`, `error`) keep their meaning.

## Error message catalog (additions)

| Message | Condition |
|---------|-----------|
| `conflicting declarations for repository "<repo>": <fileA> vs <fileB> (differing: urls, sha256); run inspect and resolve before checkout` | FR-015 abort |
| `cannot resolve load @<repo>//<path>: repository not in working area and download fallback refused (<reason>)` | inspect warning (FR-009) |
| `repository "<repo>" declarations are conflicted; no patch generated` | checkout per-repo refusal |
| `external repository "<repo>" content unresolved at checkout time; external declarations skipped` | checkout warning (Decision 6) |
| `dependency "<name>" has no declared sha256; download fallback refused` | G1 refusal |
