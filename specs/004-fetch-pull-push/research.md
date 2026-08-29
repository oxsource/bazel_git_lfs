# Research: Mirroring Core (fetch / pull / push)

Phase 0 research decisions resolving the technical unknowns for Stage 3.

## 1. Object path derivation (Maven-style reversed domain)

**Decision**: Derive the object path deterministically from the dependency's **primary (first) URL** using the WHATWG `URL` parser: reverse the hostname's dot-separated segments, then append the URL path's directory segments (excluding the final filename segment), sanitize each segment (`/[^a-zA-Z0-9._-]/ → '_'`, drop empties, drop `.`/`..`), lowercase host segments, and append `<sha256>` as the file name. Examples: `https://github.com/facebook/react/releases/download/v1.2/x.tar.gz` → `com/github/facebook/react/releases/download/v1.2/<sha256>`; a bare-host URL (`https://example.com/x.tar.gz`) → `com/example/<sha256>`.

**Rationale**: FR-003 fixes the layout; mirroring the URL structure (reversed host + organization/repo path) gives balanced, human-navigable, collision-resistant directories exactly like Maven coordinates (`com/github/facebook/react`). Deriving from the primary URL keeps path assignment deterministic; other URLs for the same content are recorded in the manifest's source list rather than creating new paths (FR-014).

**Alternatives considered:** Keep host unreversed (`github.com/facebook/react/...` — rejected: root-level fan-out, less Maven-like); flat `<sha256>`-only layout (rejected — the user explicitly wants domain/org directories); hash of host (opaque). Fallback for non-parsable/exotic URLs (IP hosts, ports, non-http(s), empty path): deterministic sanitized single bucket `objects/<sanitized-host-with-port>/<sha256>` with a warning reported in the command result (spec Assumptions) — never fail the whole run on layout.

## 2. Origin download + streaming SHA256

**Decision**: Use the global `fetch` (Node ≥ 18 built-in) to download from origin, streaming the response body to a temp file inside the target object directory (`<path>.<pid>.<ts>.tmp`) while piping through `node:crypto` `createHash('sha256')`. After the stream completes, compare the digest with the declared SHA256 **before** renaming the temp file into place. On failure (any URL of the list, network error, non-2xx, hash mismatch), try the next URL in `urls` order; a dependency whose SHA256 is null is rejected with `missing-sha256` without any download attempt (FR-002).

**Rationale**: FR-001/FR-002/FR-006 + G1: verify-before-store is the integrity gate. Streaming keeps memory bounded for large archives (Technical Context). Atomic temp+rename guarantees a crash never leaves a partial object (FR-004, SC-007). Trying URLs in order matches Bazel's own semantics for `urls` lists.

**Alternatives considered:** Buffered download then hash (memory blow-up on big artifacts); download-then-store-unverified (violates G1); npm request libraries (unnecessary — global fetch suffices, G5).

## 3. Local objects store

**Decision**: A small `ObjectsStore` over `.bazel_git_lfs/objects/`: `pathFor(url, sha256)` (layout from decision 1), `has(url, sha256)` (existence + SHA256 re-verification), `put(stream|bytes, url, sha256)` (atomic: stream to temp → verify → mkdir -p → rename), `get(url, sha256)` (absolute path for push), `size()`. `has` re-verifies content hash so corrupted cache entries are transparently treated as absent (FR-005).

**Rationale**: All three commands share the store; verifying on read is what makes "cached means safe" true (FR-005, SC-001). Atomic `put` satisfies FR-004/SC-007.

**Alternatives considered:** Trusting file existence without re-hash (violates corrupt-cache edge case); a separate index file (redundant — the store is content-addressed by directory layout; the mirror manifest records sources). Chosen: directory scan + verify, no index file to keep V1 simple (G5); the snapshot + manifest cover the metadata needs.

## 4. Git LFS transfer mechanics (system tools only)

**Decision**: Maintain a **disposable LFS working clone** of the mirror at `.bazel_git_lfs/mirror/` (FR-015 assumption). `push`: (1) clone (or fetch+reset if the clone exists; delete and re-clone if the checkout is dirty/corrupt — the working clone is never a source of truth); (2) ensure `.gitattributes` tracks `objects/**` with the LFS filter (`git lfs track "objects/**"`); (3) copy each to-upload object from the local store into the clone at its object path; (4) `git add` objects + manifest, commit (empty-commit avoided when nothing changed); (5) `git push` — LFS transfer rides on git-lfs's pre-push integration (invoked with `GIT_LFS_SKIP_SMUDGE=1` for clone to avoid pulling existing objects). `pull`: in the working clone `git fetch` + read `manifest.json`, then `git lfs pull --include <paths>` (or `git lfs fetch` + `git lfs checkout`) to materialize the needed objects, then verify SHA256 and copy into the local store. All git/git-lfs calls go through `mirror/lfs.ts` with argument-array exec (no shell interpolation), timeouts, and captured stderr for error reporting.

**Rationale**: FR-015 mandates system git/git-lfs; a working clone with LFS smudge is the simplest correct way to move bytes through Git LFS without reimplementing the LFS API. `GIT_LFS_SKIP_SMUDGE=1` keeps clone cheap; `--include` keeps pulls minimal. Credential handling is delegated entirely to system git (FR-016).

**Alternatives considered:** `git lfs migrate`/plumbing tricks (fragile); talking to the LFS storage API directly (violates G5/FR-015); bare clone + manual LFS object staging (more plumbing, no benefit). Rejected: all.

## 5. Mirror manifest

**Decision**: `manifest.json` at the mirror repository root: `{ version: 1, updatedAt: ISO-8601, objects: { [sha256]: { path: string, sources: string[], firstSeenAt: string } } }`. `push` merges entries: existing SHA256 → keep `path`/`firstSeen`, union new source URLs into `sources` (FR: same content from different URLs dedups to one object). Manifest and objects are written and committed **in the same commit** (FR-020). Missing/corrupt manifest is treated as empty on read with a warning only when the mirror has no objects yet; if objects exist without a manifest, `push` aborts with a clear error (never silently rebuild).

**Rationale**: FR-020 makes the manifest the authoritative mirror inventory; Stage 4 (`verify`/`list`/`search`) reads it. Same-commit update keeps the manifest and objects consistent (SC-007 atomicity at the git level).

**Alternatives considered:** Deriving inventory by scanning LFS objects (expensive, no source-URL provenance — rejected per parent guide research); per-project manifests (defeats shared dedup). JSON chosen over YAML/TOML for zero-dependency read/write.

## 6. Pull is mirror-only (strict semantics)

**Decision**: `pull` resolves snapshot dependencies against the mirror `manifest.json` (fetched via the working clone). Dependencies absent from the manifest → `not-in-mirror` with an actionable message ("mirror lacks the object; an upstream project must push it") and non-zero exit (FR-011) — no origin fallback. Materialization: `git lfs pull --include <paths>` in the working clone, verify each object's SHA256 on arrival, then copy into the local store atomically. Local entries that already verify are `cached` (no transfer).

**Rationale**: Clarification: strict git semantics keep mirror coverage explicit and auditable; origin fallback would silently mask mirror gaps and break SC-003 (mirror-only transfers). LFS `--include` avoids materializing the whole mirror on a teammate/CI machine.

**Alternatives considered:** Silent origin fallback (rejected — hides mirror gaps, violates SC-003); clone full LFS history (`git lfs pull` without include — wasteful at mirror scale).

## 7. Default profile & prerequisites checks

**Decision**: All three commands validate in order: (1) initialized config area (Stage 1 `paths` helpers — same message as `inspect`); (2) persisted snapshot readable via `FsSnapshotStore` (else `no dependency snapshot, run "bazel-git-lfs inspect" first`); (3) for `pull`/`push` only, the effective default remote profile via Stage 1 `ConfigResolver.resolveEffective` (error message from Stage 1 already names the missing configuration). `fetch` deliberately does not require a profile (origin-only).

**Rationale**: FR-012/FR-013 + reuse of Stage 1/2 infrastructure (G4). The ordering gives users one actionable error at a time.

**Alternatives considered:** Requiring a profile for `fetch` (over-restrictive — origin needs no mirror); re-inspecting the project (violates the snapshot contract, slower).

## 8. Concurrency, interruption, push rejection

**Decision**: Per-dependency try/catch — one failed dependency never aborts the run; the JSON result carries per-dependency status plus summary counts, and exit is non-zero only when at least one dependency reached a failing terminal state (for `push`, `missing-local` is informational, not failing — FR-009). Interrupted runs are safe by construction: objects land via temp+rename; the mirror working clone is reset (`git fetch && git reset --hard origin/<default> && git clean -fd`) at the start of every push/pull before use, so a dirty clone self-heals. A rejected `git push` (non-fast-forward) is reported with a "re-run push" hint; the next run re-merges the manifest (idempotent). Push performs `git pull --rebase` before pushing to reduce trivial races.

**Rationale**: Spec Edge Cases + SC-007. The objects store and the mirror are the two sources of truth; the working clone is disposable (assumption), so recovery is always "reset or re-clone".

**Alternatives considered:** Lockfiles/daemons for concurrency (over-engineered for V1, G5); aborting the whole run on first failure (bad UX for hundreds of deps).

## 9. Output & exit conventions

**Decision**: Identical conventions to Stage 2: JSON-only stdout, errors as `{ ok: false, error }` with non-zero exit; exit 0 success (including zero-dependency and all-cached runs), 1 failure, 2 usage. No `--json` flag (nothing to switch away from). Per-command result shapes: `{ ok, command, projectDir, objectsDir?, remote?, results: [{ name, sha256, status, reason? }], summary: { total, ...counts } }` (detailed in `contracts/cli.md`).

**Rationale**: FR-018 + consistency with the Stage 1/2 CLI contract (contract tests already exist for the pattern).

**Alternatives considered:** Human-readable mode (rejected — FR-018); custom exit codes per failure type (unnecessary).

## 10. Testing strategy

**Decision**: Vitest. Unit: `object-path` (URL matrix incl. multi-level TLDs, deep paths, bare-host, IP/port/query fallbacks), `store` (put/has/verify, corrupt entry, atomicity under simulated crash), `manifest` (merge semantics, corrupt manifest), `download` (URL fallback order, hash mismatch rejection, missing-sha256 rejection — mocked fetch). Integration: real temp git + git-lfs mirror (bare repo + `git lfs install` locally scoped via `GIT_LFS_HOME`-style env isolation) and a local `node:http` origin serving fixture bytes; full `fetch → push → (fresh project copy) pull` round trip asserting byte-identical stores, manifest content, idempotent re-push (no new commit), `not-in-mirror` and `missing-local` paths. Failure injection with stub git binaries in `tests/fixtures/bin/`. Contract: command surface and exit codes (sync stub absent, fetch/pull/push present, extra args → 2).

**Rationale**: SC-001..SC-008 need both hermetic unit coverage and a real-git integration path (FR-015 mandates system git — only an integration test proves the actual protocol works). A local HTTP origin replaces `file://` URLs, which Node fetch does not support.

**Alternatives considered:** Mocking git entirely (would not prove FR-015 integration); only happy-path (misses G1 rejection semantics).
