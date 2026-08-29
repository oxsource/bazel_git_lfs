# Feature Specification: Bazel Dependency Mirror Tool

**Feature Branch**: `001-bazel-dependency-mirror`

**Created**: 2026-08-28

**Status**: Implemented

**Input**: User description: "@docs/project_bootstrap.md 分析原始需求，设计整理方案,先不要实现开发"

## Clarifications

### Session 2026-08-28

- Q: Scope of the `checkout` command → A: `checkout` included in V1 as a first-class command with a dry-run safety default (later revised: no dry-run, alias-based targets)
- Q: npm publishing target → A: public npm registry (npmjs.org)
- Q: Phasing of future stages (V2/V3) → A: only brief roadmap outline of future stages now; full documents deferred until each stage is started

### Session 2026-08-29

- Q: How the CLI locates cloud config for a namespace → A: `init` runs an interactive wizard (mirror URL, GitLab host, LFS settings) producing a locally saved profile tagged by namespace; no cloud config fetch in V1 (later revised: `init` is non-interactive, creates config area silently)
- Q: How the tool authenticates to the GitLab mirror → A: delegate to system git credential helpers / SSH keys; the tool stores no secrets
- Q: How runtime commands select the profile → A: Maven-style global config in the user's home directory (e.g., `~/.bazel-git-lfs`); one active profile by default with `--namespace` override (later revised: project-local config by default, `--global` for global scope)
- Q: Implementation language → A: the CLI is implemented in TypeScript on Node.js (published as a public npm package)

## Commands (Implemented)

The V1 implementation includes the following commands:

| Command | Description |
|---------|-------------|
| `init` | Creates `.bazel_git_lfs/` config area, updates `.gitignore`, installs pre-commit hook |
| `remote add/list/remove/set-default` | Manage mirror-repository profiles (local/global) |
| `remote alias add/list/remove` | Manage global URL alias table |
| `inspect` | Read-only discovery of Bazel HTTP dependencies |
| `fetch` | Download dependencies from source URLs into local objects store |
| `push` | Upload local objects to Git LFS mirror, update manifest |
| `pull` | Fetch dependencies from mirror into local objects store |
| `status` | Check mirror integrity: valid/corrupt/missing per artifact |
| `clean` | Remove local state (objects, mirror clone, snapshot) preserving config |
| `checkout <alias>` | Switch dependency URLs: `default` (restore), `local` (local HTTP server), or profile alias |

## User Stories & Testing *(mandatory)*

### User Story 1 — Initialize config and manage profiles (Priority: P1)

A user runs `bazel-git-lfs init` to create the `.bazel_git_lfs/` config area. They then configure a mirror profile via `bazel-git-lfs remote add --alias production --url <mirror-url>`. Profiles can be managed across project-local and global scopes, with a global alias table for URL shorthand.

**Independent Test**: Run `init` in a fresh project; assert `.bazel_git_lfs/` is created. Add a remote profile; assert it is persisted and resolvable.

### User Story 2 — Discover and snapshot dependencies (Priority: P1)

A user runs `bazel-git-lfs inspect` to discover all `http_archive`/`http_file` dependencies in the project. The tool parses WORKSPACE/MODULE.bazel, extracts name, URLs, SHA256, and persists the snapshot to `.bazel_git_lfs/dependencies.json`. No files are modified.

**Independent Test**: Run against a fixture Bazel project; assert the exact expected dependency set is reported without side effects.

### User Story 3 — Mirror dependencies to Git LFS (Priority: P1)

A user runs `bazel-git-lfs fetch` to download missing artifacts from source URLs, then `bazel-git-lfs push` to upload them to the Git LFS mirror. A teammate runs `bazel-git-lfs pull` to retrieve artifacts from the mirror. SHA256 integrity is enforced at every step.

**Independent Test**: `fetch`+`push` populate the mirror; `pull` reproduces a byte-identical local store from the mirror alone; hash mismatch is rejected.

### User Story 4 — Audit mirror integrity and reset state (Priority: P2)

A user runs `bazel-git-lfs status` to check every artifact's SHA256 against the manifest, filtering by prefix or keyword. A tampered artifact is reported as corrupt. `bazel-git-lfs clean` resets local state while preserving the config profile.

**Independent Test**: `status` reports valid/corrupt/missing; `clean` removes objects/mirror/snapshot, preserves config.

### User Story 5 — Switch project URLs to a target source (Priority: P2)

A user runs `bazel-git-lfs checkout <alias>` to switch dependency URLs. `default` restores original source URLs, `local` starts a local HTTP server on port 8022 and rewrites to `http://127.0.0.1:8022/`, and a profile alias switches to that remote URL. A pre-commit hook auto-restores to default before commits.

**Independent Test**: `checkout <alias>` rewrites URLs correctly; `checkout default` restores and stops the HTTP server; pre-commit hook prevents non-default URLs from being committed.

### Edge Cases

- What happens when a dependency declares multiple URLs but no SHA256? (flagged, not auto-mirrored)
- How does the system handle a download that fails partway? (retry or fail with clear error)
- How does the system handle a corrupted local cache entry? (re-downloaded)
- How does the system handle the mirror repository not being initialized? (clear error)
- How are large artifacts handled? (Git LFS tracking)
- What happens when git/git-lfs are not installed? (clear error with install guidance)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST scan a Bazel project and discover remote HTTP dependencies from `WORKSPACE`, `WORKSPACE.bazel`, and `MODULE.bazel`, supporting `http_archive` and `http_file` rules.
- **FR-002**: System MUST extract for each dependency: its name, all source URLs, the declared SHA256, and any `strip_prefix` metadata.
- **FR-003**: System MUST provide an `inspect` command that performs discovery without downloading, uploading, or modifying anything (it persists only the tool-owned snapshot under `.bazel_git_lfs`).
- **FR-004**: System MUST provide `fetch`/`push`/`pull` commands that download, verify, cache, and upload artifacts to the Git LFS mirror.
- **FR-005**: System MUST perform SHA256 verification on every downloaded artifact and MUST NOT store any artifact whose hash does not match its declared SHA256.
- **FR-006**: System MUST use SHA256 as the content identity for deduplication (identical content under different URLs is stored once).
- **FR-007**: System MUST maintain a local cache keyed by SHA256 and reuse cached artifacts to avoid repeat downloads.
- **FR-008**: System MUST support syncing multiple projects in one invocation with deduplication across them.
- **FR-009**: System MUST upload artifacts to a shared Git LFS mirror repository, updating a manifest that records source URL, SHA256, and mirror path for each artifact.
- **FR-010**: System MUST provide a `status` command that checks mirror artifacts against their SHA256 and reports valid/corrupt/missing.
- **FR-011**: System MUST provide `status` with filtering support (`--sha256-prefix`, `--source-url`, keyword) and a `clean` command to reset local state.
- **FR-011a**: System MUST provide a `checkout` command that rewrites Bazel project URLs based on an alias target.
- **FR-011b**: System MUST NOT rewrite a dependency URL that is not yet present in the mirror, leaving it unchanged.
- **FR-012**: System MUST abstract the artifact repository behind an interface so the mirror backend (currently Git LFS) can be replaced in the future.
- **FR-013**: System MUST NOT modify business Bazel projects during inspect/fetch/push/pull/status/clean; only `checkout` modifies business projects.
- **FR-014**: System MUST initialize local configuration via an `init` command. `init` creates `.bazel_git_lfs/` and updates `.gitignore`; non-interactive.
- **FR-014a**: System MUST be published and distributed as a public npm package (npmjs.org), exposing a `bazel-git-lfs` command-line binary.
- **FR-014b**: System MUST provide a documented, repeatable release process including versioning and publishing steps.
- **FR-015**: System MUST call system `git` and `git-lfs` (e.g., clone, lfs install, add, commit, push) and MUST NOT reimplement Git/Git LFS protocols.
- **FR-016**: System MUST NOT store or manage Git credentials; it MUST rely on system git credential helpers / SSH keys for all authentication to the mirror.

### Key Entities

- **Artifact**: A downloaded third-party dependency file. Key attributes: name, source URL(s), declared SHA256, computed SHA256, storage path.
- **Mirror Manifest**: The record of what is mirrored. Contains for each SHA256: source URLs, mirror path, first-seen timestamp. Keyed by SHA256.
- **Objects Store**: Content-addressed local cache at `.bazel_git_lfs/objects/`, keyed by SHA256 with Maven-style reversed-domain layout.
- **Mirror Repository**: The shared Git LFS repository storing the manifest and LFS-tracked objects.

## Future Stages (Brief Roadmap)

- **V1 (implemented)**: init / remote / inspect / fetch / push / pull / status / clean / checkout, distributed as a public npm package.
- **V2 (later)**: company artifact mirror service — HTTP mirror endpoint, permissions/access control, CI integration, higher concurrency, caching service.
- **V3 (later)**: replace Git as artifact storage with object storage (S3 / MinIO / S3-compatible), Git retaining only metadata, configuration, scripts, and manifest.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can scan a Bazel project and obtain its complete dependency inventory within seconds, with no side effects on the project or the mirror.
- **SC-002**: Mirroring a given set of dependencies stores each unique artifact exactly once, regardless of how many projects reference it or via how many different URLs.
- **SC-003**: 100% of artifacts in the mirror pass SHA256 verification before being published; no artifact with a mismatched hash is ever stored.
- **SC-004**: Artifacts already present locally are re-served from cache without re-downloading from the public source, reducing redundant public traffic.
- **SC-005**: The mirror backend can be replaced (e.g., Git LFS to a repository) without modifying the dependency discovery or caching logic.

## Assumptions

- The company already operates a self-hosted GitLab that supports Git LFS; a shared repository (e.g., `bazel/bazel-mirror`) will be provisioned.
- The system `git` and `git-lfs` are available on the machines where the tool runs.
- The declared SHA256 in Bazel files is authoritative for artifact integrity; the tool verifies against it and refuses mismatches.
- First stage scope: Bazel remote HTTP dependencies only (`http_archive`/`http_file`); other registry types (Maven, npm, Docker) are out of scope.
- `checkout` writes directly (no dry-run); safety is provided by the pre-commit hook.
- V1 is intentionally lightweight and does not aim to be a full artifact repository.
- Backend is implemented with a content-addressed approach keyed by SHA256; the Git LFS backend is the initial implementation only.
- Node.js and npm are available in the target environment.
- The tool is implemented in TypeScript on Node.js and distributed as a public npm package.