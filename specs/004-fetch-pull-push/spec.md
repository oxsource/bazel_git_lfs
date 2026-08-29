# Feature Specification: Stage 3 - Mirroring Core (fetch / pull / push)

**Feature Branch**: `004-fetch-pull-push`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User proposal: "参考 git style 将 sync 拆分为 pull 和 push:pull 通过 inspect 的结果从 remote 拉取各个依赖项到 .bazel_git_lfs/objects 目录下;push 则是将本地的 objects 推送到 remote 仓库;objects 下按域名、组织拆分目录(参考 Maven)"

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this stage implements [Stage 3 (Mirroring Core)](../001-bazel-git-lfs-guide/plan.md), covering FR-004/FR-005/FR-006/FR-007/FR-008/FR-009/FR-012/FR-015/FR-016 of the parent spec. **The parent guide's single `sync` command is superseded by the git-style trio `fetch` / `pull` / `push`.**

## Clarifications

### Session 2026-08-29

- Q: Should `sync` be a single command as in the parent guide? → A: no — it is split into three git-style commands: **`fetch`** (original URLs → local objects, download + SHA256 verify), **`pull`** (remote mirror → local objects, based on the `inspect` snapshot), **`push`** (local objects → remote mirror). The `sync` stub is removed from the CLI.
- Q: When `push` runs and a dependency's object is missing locally (never downloaded), does `push` download it from the original URL? → A: no — `push` is a **pure local→remote transport**; a separate **`fetch` command** owns origin downloads. Missing-local dependencies are reported with a hint to run `fetch` first.
- Q: When `pull` cannot find a dependency in the remote mirror (nobody has pushed it yet), does it fall back to the original URL? → A: no — **strict git semantics: it errors** for that dependency (non-zero exit) with a message that the mirror lacks the object and an upstream project must `push` it. This keeps mirror coverage explicit and auditable.
- Q: Is the domain in the objects directory layout reversed Maven-style? → A: yes — reversed host + URL path segments (organization/repo) + SHA256, e.g. `https://github.com/facebook/react/...` → `objects/com/github/facebook/react/<sha256>`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fetch dependencies from origin into the local objects store (Priority: P1)

A contributor setting up a new mirror (or adding new dependencies) runs `bazel-git-lfs fetch` inside an initialized project that has an `inspect` snapshot. The tool reads the snapshot, and for every dependency missing from the local objects store downloads it from the declared source URLs (trying each URL in order), computes SHA256 while streaming, verifies it against the declared value, and stores it under `.bazel_git_lfs/objects/` using the Maven-style reversed-domain layout. Artifacts whose SHA256 does not match are rejected and never stored. Dependencies already present (and hash-valid) in the local store are reused without re-downloading. No remote mirror is needed for `fetch`.

**Why this priority**: Fetching and verifying from origin is the foundation of the entire mirror — without verified local objects there is nothing to push, and integrity (parent guide G1) is enforced at the entry point of the pipeline.

**Independent Test**: Run `fetch` in a fixture project whose snapshot references local-file-URL fixtures (or a mocked HTTP origin); assert objects appear under the expected reversed-domain paths, corrupt downloads are rejected and not stored, and a second run reuses the cache without re-downloading.

**Acceptance Scenarios**:

1. **Given** an initialized project with a snapshot containing 3 dependencies absent from the local store, **When** `fetch` runs, **Then** all 3 artifacts are downloaded, SHA256-verified, and stored under `.bazel_git_lfs/objects/<reversed-host>/<org>/<repo>/<sha256>`, and the JSON result reports each as `fetched`.
2. **Given** a dependency whose downloaded content does not match its declared SHA256, **When** `fetch` runs, **Then** the artifact is rejected, nothing is written under `objects/`, the dependency is reported as `failed` with a hash-mismatch reason, and the exit code is non-zero.
3. **Given** a dependency that is already present in the local store with valid content, **When** `fetch` runs again, **Then** it is reported as `cached` and no network request is made.
4. **Given** a local store entry whose content no longer matches its SHA256 (corrupted cache), **When** `fetch` runs, **Then** the entry is treated as invalid and re-downloaded.
5. **Given** a dependency with a `urls` list where the first URL fails, **When** `fetch` runs, **Then** the remaining URLs are tried in order before the dependency is reported as failed.
6. **Given** a dependency declared without a SHA256, **When** `fetch` runs, **Then** it is rejected (never downloaded-and-stored unverified) and reported as `failed` with reason `missing-sha256`.
7. **Given** two dependencies in the snapshot with different URLs but identical SHA256, **When** `fetch` runs, **Then** the content is stored exactly once under `objects/`.
8. **Given** a project that has not been initialized (or has no snapshot), **When** `fetch` runs, **Then** it reports the corresponding JSON error (`not a valid bazel_git_lfs project` / `no dependency snapshot, run "bazel-git-lfs inspect" first`) with non-zero exit.

---

### User Story 2 - Push local objects to the remote mirror (Priority: P1)

A mirror maintainer runs `bazel-git-lfs push` after `fetch`. The tool is a pure local→remote transport: for every snapshot dependency whose object exists locally, it uploads the object into the configured Git LFS mirror repository via system `git`/`git-lfs`, records it in the mirror's `manifest.json` (SHA256, object path, source URLs), and commits/pushes. Uploads are idempotent — objects already recorded in the manifest are skipped without a second upload. Dependencies missing locally are reported as `missing-local` with a hint to run `fetch` (they are not treated as push failures and do not block pushing the rest).

**Why this priority**: Push is what actually populates the shared mirror — the core business value of the tool. It pairs with fetch as the P1 "populate the mirror" pipeline (`fetch` → `push`).

**Independent Test**: Run `fetch` then `push` against a fixture project and a fixture bare LFS repository; assert the mirror gains the objects, `manifest.json` is updated and pushed, a re-run performs no duplicate uploads, and missing-local dependencies are reported without failing the push.

**Acceptance Scenarios**:

1. **Given** locally present verified objects and a configured default remote profile, **When** `push` runs, **Then** each object is uploaded to the mirror at its Maven-style path, the mirror `manifest.json` is updated (SHA256 → object path, source URLs) and committed/pushed, and the result reports each as `uploaded`.
2. **Given** an object already recorded in the mirror manifest with the same SHA256, **When** `push` runs again, **Then** it is reported as `already-mirrored` and skipped without re-upload; the push commit is empty and no new commit is created when nothing changed.
3. **Given** a snapshot dependency whose object is absent locally, **When** `push` runs, **Then** it is reported as `missing-local` with a hint to run `fetch`, the remaining objects are still pushed, and this alone does not cause a non-zero exit.
4. **Given** no default remote profile has been configured (`remote add` / `remote set-default`), **When** `push` runs, **Then** it reports a JSON error naming the missing configuration and exits non-zero.
5. **Given** a dependency whose content matches an already-mirrored SHA256 but comes from a different URL, **When** `push` runs, **Then** the object is not duplicated; the new source URL is merged into the manifest entry.

---

### User Story 3 - Pull dependencies from the remote mirror into the local store (Priority: P2)

A teammate or CI machine with the same project runs `bazel-git-lfs pull`. The tool reads the `inspect` snapshot, resolves each dependency against the remote mirror's manifest, and transfers the objects from the mirror into the local `objects/` store (via system `git`/`git-lfs`), verifying each object's SHA256 on arrival. `pull` never touches the original public URLs: the mirror is the single source. If the mirror lacks a dependency, `pull` errors for that dependency (strict semantics) with an actionable message.

**Why this priority**: Pull is the consumption side — it delivers the mirror's benefit (no repeated hits on public origins) but only becomes useful once the mirror is populated by fetch/push.

**Independent Test**: After a successful fetch+push from one fixture project, run `pull` in a second initialized copy of the project with the same snapshot and no local objects; assert all objects arrive in the local store with valid SHA256 and no origin HTTP request is made.

**Acceptance Scenarios**:

1. **Given** a mirror containing all snapshot dependencies, **When** `pull` runs in a fresh project copy, **Then** every object is downloaded from the mirror into the local store at its Maven-style path, SHA256-verified, and reported as `pulled`.
2. **Given** a dependency already present locally with valid content, **When** `pull` runs, **Then** it is reported as `cached` without a remote transfer.
3. **Given** the mirror manifest has no entry for a snapshot dependency, **When** `pull` runs, **Then** that dependency is reported as `not-in-mirror` with a message that the mirror lacks the object (an upstream project must `push` it), and the exit code is non-zero.
4. **Given** an object retrieved from the mirror whose content fails SHA256 verification, **When** `pull` runs, **Then** it is rejected, not stored, reported as `failed`, and the exit code is non-zero.
5. **Given** no default remote profile configured, **When** `pull` runs, **Then** it reports a JSON error naming the missing configuration and exits non-zero.

---

### Edge Cases

- What happens when the network is unavailable during `fetch` (origin unreachable)? (per-dependency `failed` with network reason; already-cached deps still succeed; non-zero exit)
- What happens when all URLs of a dependency fail? (dependency `failed`; fetch continues with the remaining dependencies and reports a summary)
- What happens when a dependency's SHA256 is missing? (rejected with `missing-sha256` — never stored unverified, per parent guide G1)
- What happens when the local objects directory is not writable? (JSON error, non-zero exit)
- What happens when two different dependencies produce the same object path (same host/org/repo and same SHA256)? (content-addressed: one file; both deps reference it)
- What happens when the same SHA256 is mirrored from different URLs? (single object; manifest entry accumulates source URLs)
- What happens when `push` cannot clone the mirror repository (bad URL, no credentials)? (JSON error from system git, non-zero exit, no local mutation beyond the clone attempt area)
- What happens when `git push` is rejected (e.g., non-fast-forward because someone else pushed)? (reported as failure with hint to re-run `push`; re-run is idempotent and safe)
- What happens when the mirror `manifest.json` is missing or corrupt? (re-initialized/aborted with a clear error, depending on severity; never silently overwritten)
- What happens when `pull` runs while a local object with the same path exists but is corrupt? (local entry treated as invalid and re-fetched from the mirror)
- What happens when `pull`/`push` run without a snapshot? (JSON error: run `inspect` first)
- What happens when the snapshot contains zero dependencies? (successful empty result, nothing to transfer)
- What happens when the local Git LFS working clone under `.bazel_git_lfs` is dirty (interrupted push)? (next push recovers: reset to clean state, then proceed — the local objects store is the source of truth, never the working clone)
- What happens when authentication to the mirror fails? (rely on system git credential behavior; tool MUST NOT manage credentials — reported as a git failure)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `fetch` command that reads the persisted `inspect` snapshot and downloads each dependency from its declared source URLs into the local objects store, computing SHA256 while streaming and storing only artifacts whose content matches the declared SHA256 (parent guide G1: integrity is non-negotiable).
- **FR-002**: `fetch` MUST reject and never store (locally or remotely) any artifact whose SHA256 does not match its declared value, and MUST reject dependencies declared without a SHA256 (`missing-sha256`).
- **FR-003**: System MUST store objects under `.bazel_git_lfs/objects/` using a Maven-style reversed-domain layout derived from the dependency's primary (first) source URL: reversed host segments + URL path segments (organization/repo) + `<sha256>` file name, e.g. `https://github.com/facebook/react/...` → `objects/com/github/facebook/react/<sha256>`.
- **FR-004**: Objects MUST be written atomically (write to a temporary file, verify, then rename) so interruptions never leave partial/corrupt entries.
- **FR-005**: `fetch` MUST reuse local store entries that pass SHA256 verification (`cached`) without network access, and MUST treat hash-invalid local entries as absent (re-download).
- **FR-006**: `fetch` MUST try a dependency's `urls` list in order until one succeeds, and MUST continue with the remaining dependencies after individual failures (per-dependency status + summary; non-zero exit if any dependency failed).
- **FR-007**: System MUST provide a `push` command that is a pure local→remote transport: it uploads locally present snapshot objects to the configured Git LFS mirror via system `git`/`git-lfs`, updates the mirror's `manifest.json` (SHA256, object path, source URLs), and commits/pushes. `push` MUST NOT download from original URLs.
- **FR-008**: `push` MUST be idempotent: objects already recorded in the mirror manifest (by SHA256) are skipped (`already-mirrored`) without re-upload; when nothing changed, no commit is created.
- **FR-009**: `push` MUST report snapshot dependencies missing locally as `missing-local` with a hint to run `fetch`, MUST still push the remaining objects, and `missing-local` alone MUST NOT cause a non-zero exit.
- **FR-010**: System MUST provide a `pull` command that reads the snapshot, resolves dependencies against the remote mirror's manifest, transfers objects from the mirror into the local store via system `git`/`git-lfs`, and verifies each object's SHA256 on arrival. `pull` MUST NOT contact original source URLs.
- **FR-011**: `pull` MUST report mirror-missing dependencies as `not-in-mirror` with an actionable message and MUST exit non-zero (strict git semantics; no origin fallback).
- **FR-012**: `pull` and `push` MUST require a configured default remote profile (via `remote add` + `remote set-default`); when absent they MUST report a JSON error naming the missing configuration.
- **FR-013**: `fetch`, `pull`, and `push` MUST each require an initialized config area and a persisted dependency snapshot; missing either is reported as a JSON error (`Not a valid bazel_git_lfs project...` / `no dependency snapshot, run "bazel-git-lfs inspect" first`).
- **FR-014**: Content-addressed deduplication MUST hold end to end: identical content (same SHA256) is stored exactly once locally and exactly once in the mirror, regardless of how many dependencies/URLs/projects reference it.
- **FR-015**: System MUST invoke system `git` and `git-lfs` (clone/fetch, lfs, add, commit, push) and MUST NOT reimplement Git/LFS protocols; the local LFS working clone of the mirror lives under `.bazel_git_lfs` and is fully recoverable (the objects store, not the working clone, is the source of truth).
- **FR-016**: System MUST NOT store or manage Git credentials; authentication to the mirror relies entirely on system git credential helpers / SSH keys.
- **FR-017**: `fetch`, `pull`, and `push` MUST operate on the current project only (no project-directory arguments; extra arguments are a usage error, exit 2). Cross-project dedup is achieved through the shared mirror rather than multi-project invocations (supersedes the parent guide's multi-project `sync` for V1).
- **FR-018**: All three commands MUST output valid structured JSON to stdout only (no human mode, no `--json` flag), including per-dependency status (`fetched`/`cached`/`failed`, `uploaded`/`already-mirrored`/`missing-local`, `pulled`/`cached`/`not-in-mirror`/`failed`), summary counts, and errors as `{ ok: false, error }` with non-zero exit.
- **FR-019**: The CLI MUST remove the `sync` stub and register `fetch`, `pull`, and `push` in its place.
- **FR-020**: The mirror manifest (`manifest.json`) MUST be the authoritative record of what the mirror contains (SHA256 → object path, source URLs) and MUST be updated in the same push commit as the objects it describes.

### Key Entities

- **Object**: A verified artifact in the local store, content-addressed by SHA256, stored at `objects/<reversed-host>/<org>/<repo>/<sha256>` (Maven-style layout derived from the primary source URL).
- **Objects Store**: The `.bazel_git_lfs/objects/` directory tree; the local content-addressed cache and the source of truth for `push`.
- **Mirror Manifest**: `manifest.json` maintained in the mirror repository; maps each SHA256 to its object path and source URLs; authoritative record of mirror contents.
- **Mirror Profile**: The configured remote (from Stage 1 `remote` commands) that `pull`/`push` target; a default profile is required.
- **Dependency Snapshot**: The persisted `inspect` result (Stage 2) that all three commands consume; the only dependency input.
- **LFS Working Clone**: The local clone of the mirror repository under `.bazel_git_lfs` used by push/pull transfers via system git/git-lfs; disposable and recoverable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of fetched artifacts stored under `objects/` match their declared SHA256; zero hash-mismatched or missing-SHA256 artifacts are ever stored locally or pushed (G1).
- **SC-002**: A `fetch` → `push` round trip populates a fixture mirror with all snapshot objects and a `manifest.json` entry per SHA256; a second `push` reports `already-mirrored` for all and creates no new commit.
- **SC-003**: A `pull` in a fresh project copy with the same snapshot transfers zero bytes from original URLs (mirror-only) and produces a byte-identical local objects store.
- **SC-004**: Objects are laid out exactly per the Maven-style reversed-domain scheme for all fixture URLs (including hosts with multi-level TLDs and URLs with deep paths).
- **SC-005**: Identical content referenced by different URLs/dependencies is stored exactly once locally and exactly once in the mirror (verified by file counts).
- **SC-006**: All three commands are JSON-only, machine-consumable, and report per-dependency status with accurate summary counts; failures yield `{ ok: false, error }` and non-zero exit.
- **SC-007**: Interrupting a fetch or push at any point never leaves a corrupt object in the local store or a half-updated manifest (atomicity).
- **SC-008**: A user who runs `pull`/`push` without a configured default remote, or any of the three without `init`/`inspect`, receives a clear, actionable JSON error.

## Assumptions

- The three commands consume the Stage 2 snapshot (`.bazel_git_lfs/dependencies.json`) as their dependency input; they do not re-inspect the project. Running `inspect` again refreshes the snapshot.
- The object path is derived from the dependency's **primary (first) URL**; when the same content arrives from other URLs, the manifest accumulates the additional source URLs rather than creating additional object paths.
- URL→path derivation is deterministic string manipulation of the URL (reversed host + path segments); exotic URLs (IP hosts, ports, query strings) fall back to a sanitized single-bucket layout and are reported as warnings.
- `push` maintains a disposable LFS working clone of the mirror under `.bazel_git_lfs`; it may be deleted and re-cloned at any time without data loss (objects store + mirror are the sources of truth).
- Git LFS object transfer for pull/push relies on the mirror being a real Git + LFS repository; the tool configures LFS tracking patterns in the mirror clone as needed.
- Stage 3 does not implement `verify`, `list`, `search`, or `rewrite` (Stage 4); those later commands read the same objects store, snapshot, and manifest.
- Multi-project invocation (parent guide FR-008's "sync multiple projects in one invocation") is dropped for V1; shared-mirror dedup (FR-014) delivers the same end result across projects run separately.
