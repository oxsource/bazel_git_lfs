# Feature Specification: Stage 2 - Discovery (inspect)

**Feature Branch**: `003-discovery-inspect`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "设计实现Stage 2 discovery" (design and implement Stage 2 — Discovery / `inspect` of the bazel-git-lfs guide)

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this stage implements [Stage 2 (Discovery)](../001-bazel-git-lfs-guide/plan.md), covering FR-001, FR-002, FR-003, and FR-013 of the parent spec.

## Clarifications

### Session 2026-08-29 (2) — latest, supersedes conflicts

- Q: Is the separate `cache` command needed? → A: no — `inspect` itself persists the discovered snapshot to `.bazel_git_lfs/dependencies.json` (atomic write); the standalone cache command is removed
- Q: Does `inspect` take a project-directory argument? → A: no — `inspect` always operates on the **current project directory** (where `init` was run); extra arguments are a usage error
- Q: Does `inspect` support human-readable output or a `--json` flag? → A: no — **JSON is the only output format**; errors are JSON error objects (`{ ok: false, error }`) with non-zero exit
- Q: What is the not-initialized error? → A: `Not a valid bazel_git_lfs project: <dir>. Run "bazel-git-lfs init" first.`

### Session 2026-08-29

- Q: Should the discovery command be renamed from `scan`? → A: yes — the read-only discovery command is **`inspect`**; a separate **cache command** writes the discovery result into `.bazel_git_lfs` so `list` reads are fast, keeping `inspect` strictly read-only *(superseded by Session 2: the cache command was removed and `inspect` persists the snapshot itself)*
- Q: Does `inspect` require `init` first? → A: yes — `inspect` runs after `init`; it requires an initialized config area and reports a clear error when none exists
- Q: Must discovery handle non-literal rule declarations? → A: yes — `http_archive`/`http_file` may be declared in `for` loops over variables or via variables holding names/URLs; the parser must resolve these to discover actual dependencies
- Q: Where do dependencies actually live? → A: dependencies are often declared in separate `.bzl` files loaded via `load()` from `WORKSPACE`/`MODULE.bazel`, not in the entry files themselves — discovery MUST follow `load()` imports into those `.bzl` files
- Q: Should discovery use Bazel's native query? → A: yes — combine file-content scanning with Bazel's own `query` (when available): query reliably determines which external repositories are actually used (vs merely declared in loaded macros) and exposes dependency relationships; file scanning provides detail and a fallback when query is unavailable

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect a Bazel project to discover remote HTTP dependencies (Priority: P1)

A user runs `bazel-git-lfs inspect` inside the current project, which has been initialized with `init`. The tool discovers every remote HTTP dependency declared via `http_archive` and `http_file` rules, with each dependency's name, all source URLs, declared SHA256, and strip prefix. Discovery combines two sources: **file-content scanning** (parsing `WORKSPACE`, `WORKSPACE.bazel`, `MODULE.bazel` AND following `load()` imports into `.bzl` files, including `for`-loop/variable-generated declarations) and **Bazel's native `query`** (when available) which authoritatively identifies which external repositories are actually used and their dependency relationships. The inspect writes nothing to the project except the dependency snapshot under `.bazel_git_lfs/dependencies.json` (atomic): nothing is downloaded, uploaded, or modified.

**Why this priority**: Discovery is the foundation of the whole tool. Every other capability (sync, verify, list, search, rewrite) depends on knowing which artifacts are needed and where they come from. It delivers immediate value with zero side effects on the project itself.

**Independent Test**: Run `inspect` in a fixture Bazel project (with `init` already run) whose dependencies are declared in a mix of the entry files and loaded `.bzl` files (including direct and loop-generated declarations); assert the tool reports the exact expected set of dependencies (name, URL, SHA256) as JSON and that no project files other than the snapshot are modified.

**Acceptance Scenarios**:

1. **Given** an initialized Bazel project with a `WORKSPACE` containing 3 `http_archive` entries, **When** the `inspect` command runs, **Then** it reports exactly those 3 dependencies with their URL and SHA256 in the JSON output.
2. **Given** an initialized Bazel project with both `WORKSPACE.bazel` and `MODULE.bazel`, **When** the `inspect` command runs, **Then** dependencies from both files are discovered.
3. **Given** dependencies declared in a `.bzl` file that is `load()`ed from `WORKSPACE`/`MODULE.bazel`, **When** the `inspect` command runs, **Then** those loaded-file dependencies are discovered and reported.
4. **Given** an `http_archive` whose `urls` field lists multiple URLs, **When** inspected, **Then** all URLs are captured and the declared SHA256 is associated with the artifact.
5. **Given** `http_archive` rules generated by a `for` loop over a variable list of names/URLs/SHA256s, **When** inspected, **Then** the loop-generated dependencies are resolved and reported.
6. **Given** a project where `bazel query` is available, **When** the `inspect` command runs, **Then** the results are cross-checked against query's authoritative external-repo set (used vs merely-declared) and dependency relationships are noted.
7. **Given** a project that has not been initialized with `init`, **When** the `inspect` command runs, **Then** it reports `Not a valid bazel_git_lfs project` with an instruction to run `init` first (JSON error, non-zero exit).
8. **Given** an inspect of an initialized project with no HTTP dependencies, **When** the command runs, **Then** the tool reports an empty result and exits successfully.
9. **Given** `inspect` is invoked with any extra argument or an unknown option, **When** the command runs, **Then** it exits with a usage error (exit 2).

---

### User Story 2 - Consume inspect results as structured JSON (Priority: P2)

`inspect` prints valid, structured JSON to stdout — the only output format — containing the full dependency set, warnings, scanned files, query cross-check status, and the snapshot path. This is directly consumable by scripts, CI, and later stages.

**Why this priority**: Machine-readable output is the contract for automation and the basis for later stages (sync reads the same discovered set). It is a thin addition once discovery works.

**Independent Test**: Run `inspect` in a fixture project; assert stdout parses as JSON containing the expected dependency set and snapshot path.

**Acceptance Scenarios**:

1. **Given** a project with discovered dependencies, **When** `inspect` runs, **Then** it prints valid JSON containing the full dependency set and the snapshot path.
2. **Given** an inspect error (e.g., unparsable Bazel file), **When** the command runs, **Then** it prints a JSON error object (`{ ok: false, error }`) and exits non-zero.

---

### User Story 3 - Persist inspect results for fast `list` reads (Priority: P2)

`inspect` itself persists the discovered dependency set into the project's `.bazel_git_lfs/dependencies.json` (atomic write) — there is no separate cache command. The snapshot is then available for fast `list`/query reads (later stages) without re-inspecting the project.

**Why this priority**: Automatic persistence makes repeated queries fast with zero extra user steps. It is valuable once discovery works but not required for discovery itself.

**Independent Test**: Run `inspect` in a fixture project; assert a dependency snapshot file is created under `.bazel_git_lfs` containing the discovered dependency set, and that re-running `inspect` refreshes it (idempotent overwrite).

**Acceptance Scenarios**:

1. **Given** an initialized project with discovered dependencies, **When** `inspect` runs, **Then** a dependency snapshot is written under `.bazel_git_lfs` and its path is included in the JSON output.
2. **Given** the persisted snapshot exists, **When** a `list`/query read is performed, **Then** it reads from the persisted snapshot without re-inspecting.
3. **Given** a stale or missing snapshot, **When** `inspect` runs again, **Then** it refreshes the snapshot.

---

### Edge Cases

- What happens when the project directory does not exist or is not readable?
- What happens when the project has not been initialized with `init`?
- What happens when a Bazel file is present but is not valid/cannot be parsed?
- What happens when a dependency declares multiple URLs but no SHA256?
- What happens when `http_archive`/`http_file` spans multiple lines or uses comments?
- What happens when a dependency is declared in both `WORKSPACE` and `WORKSPACE.bazel`?
- What happens when a project has none of the three Bazel files?
- How are duplicate declarations of the same rule name handled across files?
- What happens when a dependency is declared in a `.bzl` file that is `load()`ed from the entry files?
- What happens when `load()` points to a file that does not exist or cannot be read?
- What happens when `bazel query` is not available on the machine (Bazel not installed)?
- What happens when `bazel query` fails (e.g., the workspace is not fully loadable)?
- What happens when query and file-scanning disagree on the dependency set? (query is authoritative for "used vs merely declared"; both are reported)
- What happens when a rule uses a variable for its name/URLs (e.g., `name = SOME_VAR` or inside a `for` loop)?
- What happens when a `for` loop over variables produces dependencies that cannot be fully resolved (e.g., a value depends on runtime-only logic)?
- What happens when `inspect` runs in a project that has not been initialized with `init`? (reported as "not a valid bazel_git_lfs project")
- What happens when `.bazel_git_lfs` is not writable when `inspect` runs?
- What happens when a persisted snapshot is stale (project files changed since it was written)?
- What happens when `list` reads a missing snapshot (never written)? (reported clearly; re-run `inspect`)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST inspect a Bazel project and discover remote HTTP dependencies from `WORKSPACE`, `WORKSPACE.bazel`, and `MODULE.bazel`, supporting `http_archive` and `http_file` rules.
- **FR-001a**: System MUST follow `load()` imports from the entry files into `.bzl` files and discover `http_archive`/`http_file` declarations there (dependencies often live in loaded files, not the entry files).
- **FR-002**: System MUST extract for each dependency: its name, all source URLs, the declared SHA256, and any `strip_prefix` metadata.
- **FR-002a**: System MUST record the file that actually declares each dependency (entry file or loaded `.bzl` file) for traceability.
- **FR-003**: System MUST provide an `inspect` command that performs discovery without downloading, uploading, or modifying anything; the only thing it writes is the dependency snapshot under `.bazel_git_lfs`.
- **FR-003a**: `inspect` MUST persist the discovered dependency snapshot into the project's `.bazel_git_lfs/dependencies.json` (atomic write) so later `list`/query reads are fast without re-inspecting.
- **FR-004**: `inspect` MUST operate on the current project directory only; it takes no project-directory argument, and extra arguments MUST be rejected as a usage error (exit 2).
- **FR-005**: System MUST report an empty result (exit 0) when a project has no remote HTTP dependencies.
- **FR-006**: `inspect` MUST output valid, structured JSON to stdout; JSON is the only output format (no human mode, no `--json` flag). The JSON includes the snapshot path.
- **FR-007**: System MUST report errors as JSON error objects (`{ ok: false, error }`) on stdout with non-zero exit for `inspect` failures (e.g., unparsable Bazel file, not-initialized project, unwritable config area).
- **FR-008**: System MUST require an initialized config area (`init`) before `inspect` runs; when the project is not initialized, System MUST report `Not a valid bazel_git_lfs project: <dir>. Run "bazel-git-lfs init" first.`
- **FR-009**: System MUST handle `http_archive`/`http_file` rules spanning multiple lines, with comments, and with a single `url` or a `urls` list.
- **FR-010**: System MUST resolve dependencies declared through variables and `for` loops (e.g., iterating a variable list of names/URLs/SHA256s) and report the resolved dependencies; unresolvable loop-generated declarations MUST be reported rather than silently dropped.
- **FR-011**: System MUST use Bazel's native `query` (when available) to cross-check the discovered set against the external repositories that are actually used, and to surface dependency relationships; when query is unavailable or fails, System MUST fall back to file-content scanning alone and report that query was not used.
- **FR-012**: System MUST expose a shared `Dependency`/`InspectResult` model (backend-agnostic) that later stages (sync/verify/rewrite) consume.
- **FR-013**: `inspect` MUST refresh/overwrite an existing snapshot and write atomically (no partial/corrupt snapshot on interruption).

### Key Entities

- **Dependency**: A remote HTTP dependency discovered in a Bazel project. Attributes: name (rule name), urls (source URL list), sha256 (declared integrity hash, when present), stripPrefix (optional), sourceFile (which file declared it — an entry file or a loaded `.bzl` file).
- **Scan Result**: The set of discovered dependencies for a scanned project, plus per-dependency metadata, source coverage (which files were scanned), and discovery method notes (whether Bazel query was used for cross-checking).
- **Dependency Snapshot**: The persisted form of an Inspect Result stored under `.bazel_git_lfs/dependencies.json` by `inspect`, read by later `list`/query reads.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Inspecting a typical Bazel project completes in under 5 seconds with no side effects on project files.
- **SC-002**: 100% of `http_archive`/`http_file` declarations in fixture projects — including direct, `for`-loop-generated, and `load()`ed-`.bzl`-file declarations — are discovered with correct name, URLs, and SHA256.
- **SC-003**: `inspect` never creates, modifies, or deletes any project file except the snapshot under `.bazel_git_lfs/dependencies.json` (atomic write).
- **SC-004**: Empty projects and projects without HTTP dependencies return a successful empty result.
- **SC-005**: A user can consume inspect results programmatically — all output is JSON by default.
- **SC-006**: `inspect` requires an initialized config area; a user who runs it without `init` receives a clear, actionable error ("not a valid bazel_git_lfs project").
- **SC-007**: When `bazel query` is available, discovery distinguishes dependencies that are actually used from those merely declared in loaded macros, and notes dependency relationships.
- **SC-008**: After `inspect` runs, a `list`/query read uses the persisted snapshot without re-inspecting the project.

## Assumptions

- The inspected project uses standard Bazel files (`WORKSPACE`, `WORKSPACE.bazel`, `MODULE.bazel`) at the project root, and may load helper files (`.bzl`) that declare the actual `http_archive`/`http_file` rules.
- The parser targets `http_archive` and `http_file` rules only; other Bazel rules are ignored during discovery (from the parent guide).
- A declared SHA256, when present, is authoritative; its absence is reported but does not block discovery (mirroring rejects such artifacts later, per the parent guide).
- Discovery handles the common Bazel idioms: literal rule calls, `for` loops over variable lists, variables holding names/URLs/SHA256s, and `load()` into `.bzl` files. It does not execute arbitrary Starlark logic.
- Bazel may or may not be installed. When it is, `bazel query` is used as an authoritative cross-check for "actually used" external repositories and dependency relationships; when it is not (or fails), file-content scanning alone is the fallback, and this is reported.
- `inspect` requires an initialized config area (`init`); it does not require a mirror profile to be configured (a profile is needed only by later stages).
- The dependency snapshot lives under the project's `.bazel_git_lfs` and is read by later stages (e.g., `list`); it is separate from the config file and holds no secrets.
- Stage 2 does not implement downloading, mirroring, verifying, or URL rewriting; it provides discovery, reporting, and a local dependency snapshot only.
