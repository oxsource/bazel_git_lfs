# Feature Specification: Bazel Dependency Mirror Tool

**Feature Branch**: `001-bazel-dependency-mirror`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "@docs/project_bootstrap.md 分析原始需求，设计整理方案,先不要实现开发"

## Clarifications

### Session 2026-08-28

- Q: Scope of the `rewrite` command → A: `rewrite` included in V1 as a first-class command with a dry-run safety default
- Q: npm publishing target → A: public npm registry (npmjs.org)
- Q: Phasing of future stages (V2/V3) → A: only brief roadmap outline of future stages now; full documents deferred until each stage is started

### Session 2026-08-29

- Q: How the CLI locates cloud config for a namespace → A: `init` runs an interactive wizard (mirror URL, GitLab host, LFS settings) producing a locally saved profile tagged by namespace; no cloud config fetch in V1 (mavenrepo-style cloud config deferred to V2)
- Q: How the tool authenticates to the GitLab mirror → A: delegate to system git credential helpers / SSH keys; the tool stores no secrets
- Q: How runtime commands select the profile → A: Maven-style global config in the user's home directory (e.g., `~/.bazel-git-lfs`); one active profile by default with `--namespace` override
- Q: Implementation language → A: the CLI is implemented in TypeScript on Node.js (published as a public npm package)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scan a Bazel project and discover HTTP dependencies (Priority: P1)

A developer runs the tool against a Bazel project directory (e.g., `graph_runtime`). The tool parses `WORKSPACE`, `WORKSPACE.bazel`, and `MODULE.bazel`, and extracts all remote HTTP dependencies (`http_archive`, `http_file`), capturing each dependency's name, source URL(s), declared SHA256, and strip prefix. Nothing is uploaded and no project file is changed — the only write is the tool-owned dependency snapshot under `.bazel_git_lfs`.

**Why this priority**: Discovery is the foundation. Every other capability (download, verify, cache, mirror) depends on first knowing which artifacts are needed. It delivers immediate value by producing an inventory of external dependencies with no side effects.

**Independent Test**: Run against a fixture Bazel project containing known `http_archive`/`http_file` entries; assert the tool reports the exact expected set of dependencies (name, URL, SHA256) without modifying any files.

**Acceptance Scenarios**:

1. **Given** a Bazel project with a `WORKSPACE` containing 3 `http_archive` entries, **When** the scan command runs, **Then** the tool lists exactly those 3 dependencies with their URL and SHA256.
2. **Given** a Bazel project with both `WORKSPACE.bazel` and `MODULE.bazel`, **When** the scan command runs, **Then** dependencies from both files are discovered.
3. **Given** an `http_archive` whose `urls` field lists multiple URLs, **When** scanned, **Then** all URLs are captured and the declared SHA256 is associated with the artifact.
4. **Given** a scan of a project with no HTTP dependencies, **When** the command runs, **Then** the tool reports an empty result and exits successfully.

---

### User Story 2 - Mirror artifacts to a shared Git LFS repository (Priority: P2)

A user runs the **sync** command against one or more Bazel projects. The tool discovers dependencies, checks the local cache and the remote mirror manifest, downloads any missing artifacts from their original URLs, verifies each against its declared SHA256, and uploads valid artifacts to the company's shared Git LFS mirror repository, recording them in the manifest and committing/pushing the change.

**Why this priority**: Mirroring is the core business value (reducing repeated public downloads) but only makes sense once discovery exists. It is heavier and mutates shared state, so it is secondary to the safe read-only scan.

**Independent Test**: Run sync against a fixture project whose artifacts are not yet in the mirror; assert the mirror repository gains the new artifacts, the manifest is updated, and a commit/push occurs. Re-run against a project whose artifacts already exist; assert no duplicate artifacts are uploaded.

**Acceptance Scenarios**:

1. **Given** an artifact missing from both cache and mirror, **When** sync runs, **Then** it downloads the artifact, verifies its SHA256, uploads it to the mirror, updates the manifest, and pushes.
2. **Given** an artifact already present in the local mirror manifest (by SHA256), **When** sync runs, **Then** it is skipped without re-download or re-upload.
3. **Given** a downloaded artifact whose SHA256 does not match the declared value, **When** sync runs, **Then** the artifact is rejected, not stored in the mirror, and the failure is reported.
4. **Given** the same artifact referenced by different projects with different URLs but the same SHA256, **When** sync runs across both projects, **Then** the artifact is stored exactly once.

---

### User Story 3 - Local cache to avoid repeated downloads (Priority: P3)

When artifacts are downloaded, the tool keeps a local content-addressed cache keyed by SHA256. On subsequent syncs, artifacts present in the local cache are reused without hitting the original (e.g., public GitHub) URL again.

**Why this priority**: The cache is an optimization that reduces public download pressure and speeds up repeated runs, but mirroring works correctly without it. It is a lower-cost addition layered on top of sync.

**Independent Test**: Run sync once to populate the cache; run it again and assert the second run does not re-download artifacts already in the local cache.

**Acceptance Scenarios**:

1. **Given** an artifact previously downloaded and cached by SHA256, **When** sync runs again for the same artifact, **Then** the artifact is read from cache instead of the public source.
2. **Given** a cache entry whose contents fail SHA256 verification, **When** sync runs, **Then** the cached entry is treated as invalid and re-downloaded.

---

### User Story 4 - Verify mirror integrity (Priority: P3)

The user runs a **verify** command to check that artifacts stored in the mirror are consistent with the manifest and their recorded SHA256 values. Any artifact whose content no longer matches its SHA256 is reported as corrupted.

**Why this priority**: Integrity assurance protects the value of the mirror but is a maintenance capability rather than a core sync capability, so it ranks lower.

**Independent Test**: Tamper with an artifact in the mirror and run verify; assert the tool flags that artifact as corrupt.

**Acceptance Scenarios**:

1. **Given** a mirror where all artifacts match their SHA256, **When** verify runs, **Then** the tool reports all artifacts as valid.
2. **Given** a mirror where one artifact has been modified, **When** verify runs, **Then** the tool identifies that artifact as corrupt.

---

### User Story 5 - Rewrite business project URLs to internal mirror URLs (Priority: P2)

A user runs a **rewrite** command against a Bazel project. The tool rewrites the `urls` in `WORKSPACE`/`MODULE.bazel` from their original public URLs to the corresponding internal mirror URLs, so the project can build against the company mirror. By default it runs in a **dry-run** mode that only previews the proposed changes; an explicit flag is required to actually write to the files. The tool does not rewrite any URL that is not yet present in the mirror, and leaves the rest of the project untouched.

**Why this priority**: Rewriting lets business projects consume the mirror, which is the payoff of mirroring. It is first-class in V1 but, because it mutates business files, it is gated behind a dry-run default and a confirmation flag.

**Independent Test**: Run rewrite in dry-run against a fixture project and assert it prints the proposed URL changes without modifying files; run with the write flag and assert the files are updated to mirror URLs and nothing else changes.

**Acceptance Scenarios**:

1. **Given** a Bazel project with an artifact already mirrored, **When** the user runs rewrite in dry-run mode, **Then** the tool shows the proposed URL replacement and does not modify the project.
2. **Given** the same project, **When** the user runs rewrite with the write flag, **Then** the project URL is updated to the mirror URL.
3. **Given** a project with a dependency that is not yet in the mirror, **When** the user runs rewrite, **Then** that dependency's URL is left unchanged.
4. **Given** a project, **When** rewrite runs, **Then** nothing other than the targeted URL declarations is modified.

---

### User Story 5 - Query the mirror inventory (Priority: P3)

The user runs **list** to view all mirrored artifacts, or **search** with a keyword (e.g., a dependency name) to filter. This supports understanding what is available in the mirror.

**Why this priority**: It is a helpful convenience for understanding the mirror but is not required for the core download/mirror workflow.

**Independent Test**: After mirroring known artifacts, run list and search and assert the correct artifacts are returned.

**Acceptance Scenarios**:

1. **Given** a mirror with several artifacts, **When** the user runs list, **Then** all artifacts and their metadata are shown.
2. **Given** a mirror with an artifact named `abseil`, **When** the user runs `search abseil`, **Then** matching artifacts are returned.

---

### User Story 6 - Install and publish the tool as an npm package (Priority: P2)

The tool is distributed as a Node.js command-line utility published to the public npm registry (npmjs.org). A user installs it globally or per-project (e.g., `npm install -g bazel-git-lfs` or as a devDependency), and the `bazel-git-lfs` command becomes available. The project provides the configuration, versioning, and documentation needed for a repeatable release to npm.

**Why this priority**: Distribution is how users obtain the tool. Publishing to the public registry makes it broadly installable, and documenting the release process ensures repeatable, well-versioned releases.

**Independent Test**: Publish a version to npm (or a local npm registry proxy), install it in a fresh project, and assert the `bazel-git-lfs` binary is invocable and responds to commands.

**Acceptance Scenarios**:

1. **Given** a released version of the package, **When** a user runs `npm install -g bazel-git-lfs`, **Then** the `bazel-git-lfs` CLI is available on the PATH.
2. **Given** the package source, **When** the maintainer follows the documented release steps, **Then** a new version is published to npm with an incremented version number.
3. **Given** the published package, **When** a user invokes `bazel-git-lfs --help`, **Then** the available commands and usage are shown.

---

### Edge Cases

- What happens when a dependency declares multiple URLs but no SHA256?
- How does the system handle a download that fails partway (network interruption, timeout)?
- How does the system handle a mirror repository that is not yet initialized?
- How does the system handle a corrupted local cache entry?
- How does the system handle duplicate dependencies across multiple projects in a single sync run?
- What happens when an artifact exists in the mirror but is missing from the manifest?
- How are large artifacts handled to avoid bloating the Git repository? (Git LFS tracking)
- What happens when git/git-lfs are not installed or the mirror remote is unreachable?
- How does the tool avoid accidentally modifying business Bazel projects?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST scan a Bazel project and discover remote HTTP dependencies from `WORKSPACE`, `WORKSPACE.bazel`, and `MODULE.bazel`, supporting `http_archive` and `http_file` rules.
- **FR-002**: System MUST extract for each dependency: its name, all source URLs, the declared SHA256, and any `strip_prefix` metadata.
- **FR-003**: System MUST provide an `inspect` command that performs discovery without downloading, uploading, or modifying anything (it persists only the tool-owned snapshot under `.bazel_git_lfs`).
- **FR-004**: System MUST provide a `sync` command that discovers dependencies, checks cache and mirror, downloads missing artifacts, and mirrors them.
- **FR-005**: System MUST perform SHA256 verification on every downloaded artifact and MUST NOT store any artifact whose hash does not match its declared SHA256.
- **FR-006**: System MUST use SHA256 as the content identity for deduplication (identical content under different URLs is stored once).
- **FR-007**: System MUST maintain a local cache keyed by SHA256 and reuse cached artifacts to avoid repeat downloads.
- **FR-008**: System MUST support syncing multiple projects in one invocation with deduplication across them.
- **FR-009**: System MUST upload artifacts to a shared Git LFS mirror repository, updating a manifest that records source URL, SHA256, and mirror path for each artifact.
- **FR-010**: System MUST provide a `verify` command that checks mirror artifacts against their SHA256.
- **FR-011**: System MUST provide `list` and `search` commands to query the mirror inventory.
- **FR-011a**: System MUST provide a `rewrite` command that rewrites Bazel project URLs to internal mirror URLs, running in a **dry-run mode by default** and requiring an explicit flag to write changes to disk.
- **FR-011b**: System MUST NOT rewrite a dependency URL that is not yet present in the mirror, leaving it unchanged.
- **FR-012**: System MUST abstract the artifact repository behind an interface so the mirror backend (currently Git LFS) can be replaced in the future without rewriting discovery or cache logic.
- **FR-013**: System MUST NOT modify business Bazel projects during scan/sync; only the dedicated `rewrite` command (with an explicit write flag) modifies business projects.
- **FR-014**: System MUST initialize local configuration via an `init` command. `init` is an interactive wizard (mirror repo URL, GitLab host, Git LFS settings) that saves a local profile tagged by a user-provided namespace; all config resolution is local, with no cloud config fetch in V1. Profiles live in a Maven-style global config directory under the user's home (e.g., `~/.bazel-git-lfs`), with one active profile used by default and overridable per-invocation via `--namespace`.
- **FR-014a**: System MUST be published and distributed as a public npm package (npmjs.org), exposing a `bazel-git-lfs` command-line binary.
- **FR-014b**: System MUST provide a documented, repeatable release process including versioning and publishing steps.
- **FR-015**: System MUST call system `git` and `git-lfs` (e.g., clone, lfs install, add, commit, push) and MUST NOT reimplement Git/Git LFS protocols.
- **FR-016**: System MUST NOT store or manage Git credentials; it MUST rely on system git credential helpers / SSH keys for all authentication to the mirror (clone, push, fetch).

### Key Entities

- **Artifact**: A downloaded third-party dependency file. Key attributes: name, source URL(s), declared SHA256, computed SHA256, version/tag, strip prefix, storage path.
- **Manifest**: The record of what is mirrored. Contains for each artifact: source, SHA256, mirror path. Used for existence checks, lookup, integrity, and auditing.
- **Local Cache**: A content-addressed store of downloaded artifacts keyed by SHA256.
- **Mirror Repository**: The shared Git LFS repository storing metadata, manifest, scripts, and large artifacts (which live in Git LFS).

## Future Stages (Brief Roadmap)

The following stages are outlined at a high level only. Full design planning guides are not written yet; each stage will be specified and planned when started. The core model (dependency discovery, caching, content-addressed integrity, pluggable repository backend) is designed to carry forward across all stages.

- **V1 (current spec)**: scan / sync / cache / verify / list / search / rewrite + init, distributed as a public npm package, mirroring into Git LFS on self-hosted GitLab.
- **V2 (later design planning guide)**: company artifact mirror service — HTTP mirror endpoint, permissions/access control, CI integration, higher concurrency, caching service; also adds mavenrepo-style cloud/remote configuration so `init` can resolve a full profile from a bare namespace (simplifying CLI input).
- **V3 (later design planning guide)**: replace Git as artifact storage with object storage (S3 / MinIO / S3-compatible), Git retaining only metadata, configuration, scripts, and manifest.

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
- Phase 1 does NOT modify business Bazel projects during scan/sync; URL rewriting (`rewrite`) is a V1 command but defaults to dry-run and only mutates files when an explicit write flag is given.
- V1 is intentionally lightweight and does not aim to be a full artifact repository (no Maven/npm/Docker registry, no object storage, no web UI, no complex permission system).
- Backend is implemented with a content-addressed approach keyed by SHA256; the Git LFS backend is the initial implementation only.
- `init` resolves all configuration locally via an interactive wizard; mavenrepo-style cloud/remote configuration keyed by a bare namespace is deliberately deferred to V2 (see Future Stages).
- Node.js and npm are available in the target environment.
- The tool is implemented in TypeScript on Node.js (a technical constraint carried into the plan).
- The tool is distributed as a public npm package (npmjs.org); release and versioning are managed through standard npm tooling.