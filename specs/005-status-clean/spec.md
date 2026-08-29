# Feature Specification: Stage 4 — Status / Clean

**Feature Branch**: `005-status-clean`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "Stage 4: Status / Clean (S4) — status, clean, query and audit the mirror"

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this stage implements [Stage 4 (Mirror Consumption)](../001-bazel-git-lfs-guide/plan.md), covering FR-010 and FR-011 of the parent spec. The separate `list` and `search` commands from the parent guide are consolidated into the `status` command, which lists all artifacts, reports their health, and supports keyword/prefix/source-url filtering.

## Clarifications

*No clarifications needed — the design decision to consolidate list/search into `status` was confirmed during spec creation.*

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Show mirror status with artifact health and listing (Priority: P1)

A user runs `bazel-git-lfs status` to see the complete state of the mirror. The command reads the mirror manifest, re-computes the SHA256 of each stored object, and reports every artifact's path, source URLs, and health status (`valid`, `corrupt`, or `missing`). A summary shows the total counts. The user can optionally filter by SHA256 prefix (`--sha256-prefix <hex>`), source URL substring (`--source-url <substring>`), or provide a keyword argument to search across artifact names, paths, and URLs (case-insensitive substring match). The command is JSON-only and exits non-zero when any artifact is corrupt or missing.

**Why this priority**: Health checking is the primary value of mirror consumption. Consolidating listing and searching into `status` provides a single, intuitive command for understanding the mirror's state — git-style (`git status` shows everything). Avoiding separate `list`/`search` commands reduces the command surface while covering the same use cases.

**Independent Test**: After mirroring known artifacts, run `status` and assert all artifacts are returned with `valid` status. Tamper with one artifact and re-run `status`; assert it is reported as `corrupt` with the correct expected and actual SHA256, and the exit code is non-zero. Run `status --sha256-prefix ab12` and assert only matching artifacts are returned.

**Acceptance Scenarios**:

1. **Given** a mirror where all artifacts match their SHA256, **When** `status` runs, **Then** the tool reports all artifacts as `valid` with their paths and source URLs, and exits successfully.
2. **Given** a mirror where one artifact's content has been modified, **When** `status` runs, **Then** the tool identifies that artifact as `corrupt` with the expected and actual SHA256, reports it as failed, and exits non-zero.
3. **Given** a mirror with an artifact that is missing its LFS object (pointer in git but no object in LFS storage), **When** `status` runs, **Then** the tool reports it as `missing` with a clear message.
4. **Given** a local objects store entry whose SHA256 does not match the mirror manifest, **When** `status` runs, **Then** the inconsistency is reported as a warning (the mirror manifest is authoritative).
5. **Given** a mirror with several artifacts, **When** the user runs `status --sha256-prefix ab12`, **Then** only artifacts whose SHA256 starts with `ab12` are returned.
6. **Given** a mirror with an artifact whose source URL contains `github.com`, **When** the user runs `status --source-url github.com`, **Then** only matching artifacts are returned.
7. **Given** a mirror with an artifact named `abseil`, **When** the user runs `status abseil`, **Then** matching artifacts are returned (case-insensitive substring match across name, path, and source URLs).
8. **Given** a keyword that matches no artifact, **When** the user runs `status <keyword>`, **Then** an empty result is returned successfully.
9. **Given** a mirror with no artifacts, **When** `status` runs, **Then** the tool reports an empty result and exits successfully.
10. **Given** `status` is invoked with extra arguments beyond the optional keyword, **When** the command runs, **Then** it exits with a usage error (exit 2).

---

### User Story 2 — Reset tool state for testing and recovery (Priority: P2)

A user runs `bazel-git-lfs clean` to reset the tool's local state without losing the remote profile configuration. The command removes the local objects store (`.bazel_git_lfs/objects/`), the LFS working clone (`.bazel_git_lfs/mirror/`), and the dependency snapshot (`.bazel_git_lfs/dependencies.json`). The profile configuration (`.bazel_git_lfs/config.json`) and the `.gitignore` entry are preserved. This allows re-running `inspect` → `fetch` → `push` → `pull` from scratch without re-configuring the remote.

**Why this priority**: `clean` is essential for iterative testing and recovery from corrupted local state. It enables users to quickly reset the tool without losing their mirror configuration.

**Independent Test**: Run `init` → `inspect` → `fetch` → `clean`; assert the objects store, mirror working clone, and snapshot are removed, but the config file and `.gitignore` entry remain intact. Re-run `inspect` successfully (snapshot is recreated).

**Acceptance Scenarios**:

1. **Given** an initialized project with objects, mirror working clone, and snapshot, **When** `clean` runs, **Then** the objects store, mirror working clone, and snapshot are removed, the config file and `.gitignore` entry are preserved, and the JSON result lists the removed items.
2. **Given** an initialized project with no objects or snapshot, **When** `clean` runs, **Then** it reports an empty result successfully (idempotent).
3. **Given** a project that has not been initialized, **When** `clean` runs, **Then** it reports the standard "Not a valid bazel_git_lfs project" error and exits non-zero.
4. **Given** `clean` is invoked with extra arguments, **When** the command runs, **Then** it exits with a usage error (exit 2).

---

### Edge Cases

- What happens when the mirror manifest is not available (mirror not cloned yet, or network unavailable)? (`status` reports a clear error: the mirror must be accessible; it works locally if the working clone is cached, otherwise requires the mirror)
- What happens when the mirror has objects but no manifest? (reported as a fatal error — never assume an empty inventory; same guard as Stage 3 push/pull)
- What happens when the user runs `status` on a project that has not been initialized? (same error as other commands: "Not a valid bazel_git_lfs project")
- What happens when the mirror manifest is corrupted? (parse error reported; `status` aborts)
- What happens when `clean` is run on a project that is already clean? (successful no-op, empty removal list)
- How does `status` handle very large artifacts? (streaming SHA256, same as fetch; memory-bounded)
- What happens when the LFS object store behind the mirror is temporarily unavailable? (`status` reports the object as `missing` with a network/unreachable reason)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `status` command that reads the mirror manifest and re-computes the SHA256 of each mirrored object, comparing it against the recorded value. Results are reported per artifact as `valid`, `corrupt`, or `missing`.
- **FR-002**: `status` MUST report the expected and actual SHA256 for corrupt artifacts, and MUST include the mirror path for traceability.
- **FR-003**: `status` MUST cover both the remote mirror (via the working clone manifest) and, when the local objects store is present, cross-check local entries against the manifest. The mirror manifest is authoritative.
- **FR-004**: `status` MUST exit non-zero when any artifact is corrupt or missing, and exit zero when all artifacts are valid or the mirror is empty.
- **FR-005**: `status` MUST output all artifacts as structured JSON, including SHA256, mirror path, source URLs, and first-seen date, alongside the health status for each artifact.
- **FR-006**: `status` MUST support an optional `--sha256-prefix <hex>` flag to filter by SHA256 prefix, and an optional `--source-url <substring>` flag to filter by source URL substring. Filtering is case-insensitive.
- **FR-007**: `status` MUST support an optional keyword argument that performs a case-insensitive substring match across artifact names (derived from the source URL path), mirror paths, and source URLs. When no keyword argument is provided, all artifacts are returned.
- **FR-008**: `status` MUST output valid structured JSON to stdout only (no human mode, no `--json` flag, consistent with the rest of the CLI).
- **FR-009**: `status` MUST require an initialized config area (`init`). Errors are JSON `{ ok: false, error }` with non-zero exit.
- **FR-010**: `status` MUST operate on the current project only (no project-directory arguments; extra arguments beyond the optional keyword are a usage error, exit 2).
- **FR-011**: `status` MUST use the same streaming SHA256 computation as Stage 3's `fetch` (memory-bounded, no full buffering).
- **FR-012**: `status` MUST report a clear error when the mirror manifest is missing or corrupt and the mirror contains objects (same guard as Stage 3 push/pull — never rebuild inventory silently).
- **FR-013**: System MUST provide a `clean` command that removes the local objects store (`.bazel_git_lfs/objects/`), the LFS working clone (`.bazel_git_lfs/mirror/`), and the dependency snapshot (`.bazel_git_lfs/dependencies.json`), while preserving the profile configuration (`.bazel_git_lfs/config.json`).
- **FR-014**: `clean` MUST output valid structured JSON to stdout listing the removed items.
- **FR-015**: `clean` MUST require an initialized config area (`init`). Errors are JSON `{ ok: false, error }` with non-zero exit.
- **FR-016**: `clean` MUST operate on the current project only (no project-directory arguments; extra arguments are a usage error, exit 2).
- **FR-017**: `clean` MUST be idempotent: running it on a project that is already clean is a successful no-op (exit 0, empty removal list).

### Key Entities

- **Mirror Manifest**: The authoritative inventory of mirrored artifacts, as defined in Stage 3. Keyed by SHA256, each entry records the mirror path, source URLs, and first-seen timestamp.
- **ArtifactStatus**: Per-artifact outcome (`valid`, `corrupt`, `missing`) with optional expected/actual SHA256 for corrupt entries and an error message for missing ones.
- **StatusResult**: The full set of manifest entries with per-artifact health status, optionally filtered by SHA256 prefix, source URL, or keyword.
- **CleanResult**: JSON listing of removed items (objects store, mirror working clone, snapshot) with their paths.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `status` against an intact mirror reports 100% of artifacts as `valid` and exits zero.
- **SC-002**: `status` against a mirror with a single corrupted artifact identifies exactly that artifact as `corrupt` with the correct expected and actual SHA256, and exits non-zero.
- **SC-003**: `status` against a mirror with a missing LFS object identifies that artifact as `missing` and exits non-zero.
- **SC-004**: `status --sha256-prefix` and `--source-url` correctly return filtered subsets.
- **SC-005**: `status` with a matching keyword returns the correct subset of artifacts; `status` with a non-matching keyword returns an empty result successfully.
- **SC-006**: `status` is JSON-only, machine-consumable, and reports errors as `{ ok: false, error }` with non-zero exit.
- **SC-007**: An empty mirror (no artifacts) reports empty results successfully for all commands.
- **SC-008**: `clean` removes the objects store, mirror working clone, and snapshot while preserving the config file; a second `clean` is a successful no-op.

## Assumptions

- `status` reads the manifest from the LFS working clone (same as Stage 3 push/pull); the working clone is maintained by the existing `ArtifactRepository` abstraction.
- `status` does not require a configured remote profile (it reads the manifest from the already-cloned mirror working clone).
- `status` requires only an initialized config area (to locate the mirror working clone under `.bazel_git_lfs/mirror/`).
- `status` does not modify the manifest or any objects; it is read-only with respect to the mirror.
- `clean` preserves the config file and the `.gitignore` entry; it removes only the generated state (objects, mirror working clone, snapshot).