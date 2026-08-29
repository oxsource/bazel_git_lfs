# Research: Recursive External Dependency Discovery & Checkout

**Feature**: 007-recursive-external-deps | **Date**: 2026-08-30

This resolves the technical unknowns for the plan. Decisions marked ★ refine the spec's mechanism wording (FR-011/FR-012) with a concrete, Bazel-compatible realization; the spec's observable behavior is unchanged.

## Decision 1 — Locating external repositories in Bazel's working area ★

**Decision**: Resolve `@repo//pkg/path:file.bzl` loads by locating the repository's extracted content under `$(bazel info output_base)/external/`:

1. Run `bazel info output_base` once per inspect/checkout run (exec, 30s timeout, cached; any failure → "no sandbox" mode).
2. Candidate directory names for `repo`:
   - Exact match `external/<repo>` (WORKSPACE-era naming);
   - Bzlmod canonical forms `<apparent>~<version>`, `<apparent>~`, `<apparent>+<version>+`, `<owner>+<name>+<version>` → tolerant match: directory whose name starts with `<apparent>` followed by `~` or `+`.
   - `bazel mod dump_repo_mapping ""` (JSON apparent→canonical map) as a secondary probe when the tolerant match is ambiguous; failure is non-fatal.
3. If still unresolved → "sandbox miss" → download fallback (Decision 2); if that also fails → warning naming repo + path (FR-009).

**Rationale**: `output_base/external/` is the only stable, documented location for fetched external repository content across Bazel generations; canonical-name patterns are prefix-stable enough for tolerant matching without depending on Bazel internals.

**Alternatives considered**:
- `bazel query` on external labels — returns labels, not file contents; does not materialize unfetched repos.
- Naive directory-name guessing without `bazel info` — fragile across Bazel generations; `bazel info output_base` is the documented entry point and is needed anyway.
- Running `bazel sync`/`bazel fetch` ourselves — mutates the user's build state and can be very slow; rejected (inspect stays read-only and fast).

## Decision 2 — Download-and-extract fallback (no sandbox) ★

**Decision**: When the sandbox has no match for a repository, find the *defining dependency* of that repository (the inspected dependency whose name equals the repo name) and:

1. Refuse unless the dependency declares a sha256 (G1) — refuse-with-warning, never download unverified content (FR-003).
2. Download the archive from its declared source URLs (first reachable) into a temp file under the OS temp dir, verify SHA256 before anything else; on mismatch → warning + skip (never persisted).
3. Extract with the system `tar` (`tar -xf`, auto-detects tar/zip via bsdtar on macOS and GNU tar with libarchive where available; `unzip` fallback for zip if tar fails) into a sibling temp dir.
4. Read the bzl at `<stripPrefix>/<path>` (stripPrefix from the defining dependency; empty → repo root), scan, then delete the temp dir in a `finally` block.

**Rationale**: Reuses the same integrity discipline as the fetch pipeline without persisting anything (G1/G3 untouched); system `tar` keeps G5 (no npm archive libraries).

**Alternatives considered**:
- Node-only unzip (yauzl/jszip) — new dependency, rejected (G5).
- Storing fallback content in the objects store — pollutes the mirror with transient data; rejected.
- `git clone` of git-repo dependencies — out of scope: recursive loads are resolved for http_archive/http_file dependencies only.

## Decision 3 — DFS traversal, first-encounter ownership, conflict blocking

**Decision**: The loader processes loads depth-first: each `load()` encountered is resolved (sandbox or fallback) and fully recursed before the next sibling. Bookkeeping:

- `visitedFiles`: key `repoName + ':' + path` (or project-relative path for in-tree files) — prevents cycles (FR-008) and duplicate scans.
- `resolvedRepos`: key repo name → resolution outcome (sandbox path / fallback dir / unresolvable) — one physical resolution per repo per run (FR-004).
- `declarations`: key repo/dep name → first-encountered normalized tuple `{urls(sorted), sha256, stripPrefix}` + provenance. Later encounters: identical tuple → append `alsoLoadedBy` provenance (FR-006); divergent tuple → record a **Conflict** (both sites, differing fields) and mark the result conflicted (FR-007).
- Depth bound: 32 layers; exceeding → warning, stop descending that chain.

**Rationale**: DFS guarantees the shallowest declaration wins deterministically, so later duplicate declarations never flip-flop results between runs; conflicts are detectable by simple tuple comparison after normalization (URL order-insensitive).

## Decision 4 — Patch mechanism: `patch_cmds` injection + audit patch file ★

**Decision**: The spec (FR-011/FR-012) calls for a generated patch file in the config area, made effective via a `patches` attribute on the entry declaration. Research found a hard Bazel constraint: **labels cannot reference files under dot-directories** — `//.bazel_git_lfs/patches:b.patch` is not a valid label, so a `patches` attribute cannot point into the private config area. Resolution:

1. **Generate the audit patch file** exactly as specified: `.bazel_git_lfs/patches/<repo>.patch`, URL-only replacements, deterministic (sorted deps, unified diff). It serves as the reviewable record of what will change.
2. **Apply it via `patch_cmds`** on the entry-file declaration instead of `patches`: inject/merge a shell command of the form
   `# bazel-git-lfs:checkout <repo>\nsed "s|<old-url>|<new-url>|g" <path-inside-repo> > <path-inside-repo>.bgl_tmp && mv <path-inside-repo>.bgl_tmp <path-inside-repo>`
   (POSIX-safe form — no `sed -i` dialect issues on macOS vs GNU). `patch_cmds` runs post-extraction inside the external repository — the same effect as a patch file, at fetch time, without touching the sandbox or the archive bytes (digests stay valid, FR-013).
3. **Idempotency**: commands carrying our marker prefix `# bazel-git-lfs:checkout <repo>` are recognized and replaced in place on alias switch; never stacked (FR-012). The audit patch file is regenerated atomically.
4. **Restore**: `checkout default` removes marker-tagged commands from entry files and deletes audit patches; checkout-state records injected files + command list + patch list for exact restore (FR-014). Pre-commit auto-restore covers the entry-file edits unchanged (FR-017).

**Rationale**: `patch_cmds` needs no label addressing, no additional project-tree files, no `.gitignore` edits (G2 surface stays: entry files + config area), and works identically in WORKSPACE and bzlmod (`archive_override` supports `patch_cmds` too). The observable behavior matches FR-011/FR-012: patch generated, referenced from the entry declaration, effective at fetch time.

**Alternatives considered**:
- `patches` attribute with the patch file in a non-hidden project directory — needs new visible files + `.gitignore` edits; widens G2 mutation surface; rejected.
- `--override_repository` pointing at a rewritten copy of the repo — requires managing a full copy lifecycle per repo and wiring flags into the user's build; heavier than attribute injection; rejected.
- Direct sandbox rewrite — unsafe (Bazel refetches/rebuilds content); explicitly forbidden by the spec.

## Decision 5 — Patch generation engine

**Decision**: Small in-house line-level diff: rewrite the bzl content with the existing URL-replacement logic (name-anchored, scoped to the target repo's declarations), then produce a minimal unified diff (LCS on changed regions only; typical output is 1–3 hunks). Sorted, deterministic output. If the rewritten content equals the original → no patch (record unchanged).

**Rationale**: URL rewrites are single-line substitutions; a general diff library is unnecessary (G5). Deterministic output makes re-runs produce byte-identical files (SC-005 idempotency).

## Decision 6 — Checkout re-resolves bzl content via the shared resolver

**Decision**: Checkout does not store bzl contents in the snapshot; it re-resolves each affected external repository through the same `ExternalResolver` as inspect (sandbox hit preferred, download fallback second). If unresolvable at checkout time → warning, that repo's external declarations are skipped, project-tree dependencies still process (mirrors FR-009/FR-016 degradation philosophy).

**Rationale**: Avoids duplicating possibly-large bzl contents in `dependencies.json`; guarantees the patch matches current reality (sandbox content is the truth Bazel will fetch against, modulo byte-identical archives).

## Decision 7 — Snapshot schema evolution

**Decision**: Add `schemaVersion: 2` to `dependencies.json`. New fields: per-dependency `origin`, `fromRepo`, `loadChain`, `alsoLoadedBy`; top-level `conflicts: []` and `hasConflicts: bool`. Reader coerces missing fields to defaults (v1 snapshots read cleanly; FR-010). CLI: inspect exits non-zero when `hasConflicts` (FR-007).

## Decision 8 — Target URL derivation for external dependencies

**Decision**: Reuse Stage 5's `resolveTarget` exactly. For non-default aliases the target URL is `<baseUrl>/<sha256>/<manifest-path>` — looked up in the mirror manifest by the dependency's declared sha256. A dependency without sha256, or absent from the manifest, is skipped with a warning (it cannot be mapped to a mirror target; the user should run fetch/push first).

**Rationale**: One URL derivation rule for project-tree and external declarations — no behavioral divergence between the two checkout paths.
