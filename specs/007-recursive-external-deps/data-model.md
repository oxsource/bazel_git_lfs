# Data Model: Recursive External Dependency Discovery & Checkout

**Feature**: 007-recursive-external-deps | **Date**: 2026-08-30

## Entities

### Dependency (extended)

Existing fields unchanged: `name`, `urls`, `sha256`, `stripPrefix`, `sourceFile`, `resolved`.

New fields:

| Field | Type | Description |
|-------|------|-------------|
| `origin` | `'entry' \| 'external-bzl'` | Where the declaration lives: project tree (`entry`) vs a loaded external repository's bzl file (`external-bzl`). |
| `fromRepo` | `string \| null` | Apparent name of the external repository whose bzl declared it; `null` for `entry` origin. |
| `loadChain` | `string[]` | Ordered chain of loads from the entry file to the declaring bzl, e.g. `["@B//:deps.bzl", "@C//:more.bzl"]`. `[]` for `entry`. |
| `alsoLoadedBy` | `string[][]` | Additional load chains that re-declared this dependency identically (dedup provenance; first chain stays in `loadChain`). |

Validation: `origin`/`fromRepo`/`loadChain`/`alsoLoadedBy` default to `'entry'`/`null`/`[]`/`[]` when absent (v1 snapshot compatibility).

### RepositoryResolution (per-run, not persisted)

| Field | Type | Description |
|-------|------|-------------|
| `repo` | `string` | Apparent repository name from the load target. |
| `status` | `'sandbox' \| 'fallback' \| 'unresolved'` | How content was obtained: working-area hit, download-and-extract fallback, or failure. |
| `rootDir` | `string \| null` | Directory of the extracted repository content (sandbox dir or temp dir); `null` when unresolved. |
| `temp` | `boolean` | True when `rootDir` is a temporary extraction that must be cleaned up. |
| `sourceDep` | `Dependency \| null` | The defining dependency used for fallback download (sha256/urls/stripPrefix). |

Cache semantics: at most one entry per repo name per run (FR-004). Temp dirs deleted in `finally` after their chain closes (or at run end).

### DependencyConflict

| Field | Type | Description |
|-------|------|-------------|
| `repo` | `string` | Repository/dependency name declared divergently. |
| `adopted` | `{sourceFile, urls, sha256, stripPrefix}` | First-encountered (DFS) declaration — reported only; conflicts block downstream. |
| `divergent` | `{sourceFile, urls, sha256, stripPrefix}` | The later, differing declaration. |
| `differingFields` | `('urls' \| 'sha256' \| 'stripPrefix')[]` | Which fields differ. |

Normalization: URLs compared as sorted sets; sha256/stripPrefix as trimmed strings.

### InspectResult (extended)

Existing fields unchanged (`projectDir`, `dependencies`, `warnings`, `filesScanned`, `queryUsed`, `queryExternalRepos`, `dependencyRelations`).

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | `2` | Snapshot schema version. |
| `conflicts` | `DependencyConflict[]` | Divergent re-declarations found (FR-007). |
| `hasConflicts` | `boolean` | Convenience flag; inspect CLI exits non-zero when true. |

### PatchRecord

| Field | Type | Description |
|-------|------|-------------|
| `repo` | `string` | External repository the patch targets. |
| `patchFile` | `string` | Config-area-relative audit patch path (`patches/<repo>.patch`). |
| `changes` | `{file, dependency, before, after}[]` | URL replacements encoded in the patch (same shape as checkout `CheckoutChange`). |
| `injectedIn` | `string` | Entry file carrying the injected `patch_cmds` command. |

Not persisted standalone; surfaced in checkout JSON output and mirrored into checkout state.

### CheckoutState (extended)

Existing: `alias`, `appliedAt`.

| Field | Type | Description |
|-------|------|-------------|
| `patches` | `PatchState[]` | Injected patch commands: `{repo, injectedIn, command, patchFile}`. |

Read as `[]` when absent (v1 state compatibility). `checkout default` consumes this list for exact restore (FR-014).

## State Transitions

### Repository resolution

```
(unresolved) ── sandbox hit ──→ sandbox (rootDir = external dir)
(unresolved) ── sandbox miss + defining dep with sha256 + URL ok ──→ fallback (temp rootDir)
(unresolved) ── sandbox miss + no sha256 / no URL / download fail ──→ unresolved (warning)
```

### Checkout patch lifecycle

```
absent ── checkout <non-default> ──→ injected (patch_cmds merged + audit patch written)
injected ── checkout <same-or-other non-default> ──→ injected (commands replaced in place; patch regenerated)
injected ── checkout default ──→ absent (commands removed; patch files deleted; state consumed)
conflicted repo ── checkout ──→ error exit (no patch produced; FR-015)
unresolvable repo at checkout ──→ skipped with warning (FR-016 / Decision 6)
```

### Discovery duplicate handling

```
first declaration ──→ record (ownership)
repeat, identical ──→ append alsoLoadedBy provenance
repeat, divergent ──→ DependencyConflict + hasConflicts = true (inspect exit 1; checkout refuses)
```

## Persistence

- `dependencies.json`: `schemaVersion: 2` + extended `Dependency` + `conflicts` + `hasConflicts`. Atomic write (unchanged mechanism). Readers coerce missing new fields.
- `patches/<repo>.patch`: audit unified diff; deterministic; deleted by `checkout default`.
- `checkout-state.json`: extended with `patches: PatchState[]`; v1 states read as `patches: []`.
- Temp extraction dirs: OS temp space only; never inside the project; removed in `finally`.
