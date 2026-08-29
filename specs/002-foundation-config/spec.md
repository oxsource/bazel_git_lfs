# Feature Specification: Stage 1 - Foundation & Config

**Feature Branch**: `002-foundation-config`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "针对001-bazel-git-lfs-guide中的Stage 1开始设计实现" (implement Stage 1 - Foundation & Config of the bazel-git-lfs guide)

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this stage implements [Stage 1 (Foundation & Config)](../001-bazel-git-lfs-guide/plan.md), covering FR-014 and FR-016 of the parent spec.

## Clarifications

### Session 2026-08-29

- Q: Should `init` support scoped configuration like git? → A: yes — model the tool as a git extension: support both global config (user home) and current-project-directory config, with project-local scope taking precedence (git-style layering)
- Q: Should mirror repository management be a separate command? → A: yes — split mirror-repo management into a dedicated `remote` command (git-style) supporting `--global`/`--local` scopes; `init` is reduced to creating a non-versioned `.bazel_git_lfs/` config directory (like `git init`), with no wizard and no mirror settings
- Q: Which scope is the default? → A: **project-local is the default** — all configuration lands in the project's `.bazel_git_lfs/` by default; global configuration requires an explicit `--global` flag (git-style default)
- Q: Should mirror URLs support global aliases? → A: yes — support a **global alias table** (`remote.alias.<name> = <url>`); when `remote add` is given a URL starting with `@`, resolve it through the global alias table before storing the profile
- Q: Should `remote add` verify the mirror URL is reachable? → A: no — validate format only (HTTP(S)/SSH URL parsing), never contact the remote; connectivity is deferred to the sync stage
- Q: Is an explicit way to view the effective config needed? → A: yes — `remote list` supports `--effective` to show the merged, actually-in-effect profile (per scope layering)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Initialize the config area (Priority: P1)

A user runs `bazel-git-lfs init` inside a project. The tool creates a non-versioned `.bazel_git_lfs/` config directory (like `git init` creates `.git/`). Nothing else happens: no wizard, no mirror settings, no prompts. The directory is excluded from version control so it never pollutes the project repo.

**Why this priority**: `init` is the entry point — every project using the tool needs its config area. Keeping it minimal makes it fast, scriptable, and unsurprising for git users.

**Independent Test**: Run `init` in a fresh project and assert a `.bazel_git_lfs/` directory is created, it is ignored by version control, and no other files are touched.

**Acceptance Scenarios**:

1. **Given** a project without a config directory, **When** a user runs `bazel-git-lfs init`, **Then** a `.bazel_git_lfs/` directory is created in the project.
2. **Given** the created config directory, **When** the project is committed, **Then** the `.bazel_git_lfs/` directory is not tracked by version control.
3. **Given** a project that already has a config directory, **When** `init` runs again, **Then** it is safe to re-run (no error, no data loss).
4. **Given** the tool's CLI, **When** a user runs `bazel-git-lfs --help`, **Then** they see a list of available commands including `init` and `remote`.

---

### User Story 2 - Configure a mirror repository via `remote add` (Priority: P1)

A user configures which mirror repository to use by running `bazel-git-lfs remote add`. In interactive mode it runs a guided wizard (mirror repository URL, GitLab host, Git LFS setting); in non-interactive mode (CI/scripts) the same values are passed as flags. The resulting profile is tagged by a namespace and stored in the selected scope (`--global` or `--local`).

**Why this priority**: Mirror configuration is the data every later stage (scan, sync, verify, list, search, rewrite) consumes. Separating it from `init` (like `git remote`) lets the config area exist independently of any mirror choice.

**Independent Test**: Run `remote add` (wizard and flag forms) and assert a namespace-tagged profile is saved in the selected scope with exactly the provided settings.

**Acceptance Scenarios**:

1. **Given** a project initialized with `init`, **When** a user runs `remote add` and follows the wizard, **Then** a project-local profile is saved containing the mirror repository URL, GitLab host, and Git LFS setting (no `--global` flag needed).
2. **Given** a project initialized with `init`, **When** a user runs `remote add --mirror-repo <url> --gitlab-host <host>`, **Then** a project-local profile is saved without any prompts (non-interactive, default scope).
3. **Given** a project initialized with `init`, **When** a user runs `remote add --global --mirror-repo <url> --gitlab-host <host>`, **Then** a global profile is saved in the user's home config area.
4. **Given** an existing profile with the same namespace in the same scope, **When** `remote add` runs again, **Then** the existing profile is updated without error.

---

### User Story 2a - Reference a mirror URL by global alias (Priority: P1)

A user configures a mirror by an alias instead of a full URL. The global config holds an alias table (`remote.alias.<name> = <url>`). When `remote add` is given a mirror URL starting with `@` (e.g., `@company-mirror`), the tool resolves the alias from the global alias table to the real URL and stores the profile with the resolved URL.

**Why this priority**: Aliases let teams share a canonical mirror location without pasting long URLs; the user can reference `@company-mirror` while the actual URL is managed in one global place. This matches the git-extension model (git supports URL insteadOf/alias-like mechanisms).

**Independent Test**: Define a global alias `remote.alias.company-mirror = <url>`, run `remote add --mirror-repo @company-mirror`, and assert the saved profile stores the resolved URL (not the `@` token).

**Acceptance Scenarios**:

1. **Given** a global alias `company-mirror` defined, **When** a user runs `remote add --mirror-repo @company-mirror`, **Then** the profile is saved with the alias's resolved URL.
2. **Given** an unknown alias (no matching global alias), **When** a user runs `remote add --mirror-repo @unknown`, **Then** the command fails with a clear error naming the unknown alias.
3. **Given** a mirror URL that does not start with `@`, **When** a user runs `remote add --mirror-repo https://...`, **Then** the URL is used verbatim (no alias lookup).

---

### User Story 3 - Project-local mirror config overrides the global default (Priority: P1)

Modeled on git, mirror profiles live in two scopes: **global** (user home) and **project-local** (current project). A project-local profile overrides the global profile for commands run inside that project.

**Why this priority**: Teams and CI need per-project mirror settings without disturbing a developer's personal global defaults; matching git's layering is the expected behavior for a git-extension tool.

**Independent Test**: Configure a global profile (mirror A) and a project-local profile (mirror B); run a config-resolving command inside the project and assert mirror B is used; run outside and assert mirror A.

**Acceptance Scenarios**:

1. **Given** a global profile and a project-local profile, **When** a command runs inside the project, **Then** the project-local profile takes precedence.
2. **Given** only a global profile, **When** a command runs inside a project without a local profile, **Then** the global profile is used.
3. **Given** a project-local profile, **When** `remote add --local` runs, **Then** only the project-local config is written; the global config is untouched.

---

### User Story 4 - Manage multiple mirror profiles by namespace (Priority: P2)

A user works with more than one mirror (different teams/environments). They can keep multiple namespace-tagged profiles, list them, remove them, designate one as the active default, and override the active default for a single command via `--namespace`.

**Why this priority**: Multi-profile support is valuable for real teams but not required for the tool to work; a single default profile is enough to deliver value first.

**Independent Test**: Create two profiles with different namespaces, set one active, run a command with `--namespace` pointing to the other, and assert the correct profile is used in each case.

**Acceptance Scenarios**:

1. **Given** two profiles with different namespaces, **When** `remote list` runs, **Then** both are shown with their scope and settings.
2. **Given** one active default profile, **When** a command runs, **Then** it uses the active default profile.
3. **Given** multiple profiles, **When** a command runs with `--namespace <name>`, **Then** it uses that profile instead of the default.
4. **Given** a profile no longer needed, **When** `remote remove <name>` runs, **Then** it is removed and the active default falls back to another profile (or none).

---

### User Story 5 - Let other commands read the resolved configuration (Priority: P2)

Other tool commands reliably read the effective configuration (project-local before global; active default or `--namespace`) and obtain the mirror repository URL, GitLab host, and Git LFS settings. Resolution never requires interactive input at runtime.

**Why this priority**: Later stages (discovery, sync, verify, etc.) all consume this configuration; a clean deterministic resolution path prevents rework.

**Independent Test**: After configuring a profile, invoke a placeholder config-consuming flow and assert it returns exactly the saved settings for the effective profile.

**Acceptance Scenarios**:

1. **Given** an initialized profile, **When** a command resolves configuration, **Then** it receives the settings from the effective profile (project-local first, then global).
2. **Given** no active default but a `--namespace`, **When** a command resolves configuration, **Then** it uses the namespace-tagged profile.
3. **Given** no profile exists in any scope, **When** a command resolves configuration, **Then** it reports a clear error telling the user to configure a mirror first.

---

### Edge Cases

- What happens when the user cancels/interrupts the `remote add` wizard mid-way?
- What happens when the user provides an invalid mirror repository URL? (format validation only; the URL is not contacted at config time)
- What happens when the user's home configuration directory does not exist or is not writable?
- What happens when the current project directory is not writable and `--local` is requested?
- What happens when `init` runs in a directory that already has a `.bazel_git_lfs/` directory?
- What happens when two profiles are saved with the same namespace in the same scope (overwrite vs. reject)?
- What happens when `--namespace` refers to a namespace that does not exist?
- What happens when `remote remove` is called on the active default profile?
- How does a user configure a mirror in a non-interactive environment (CI/scripts) where a wizard cannot run?
- What happens when a config file is corrupted or unreadable?
- How are global and project-local scopes merged when both define different values for the same setting? (project-local wins)
- What happens when `remote add` references an alias that is not defined in the global alias table?
- What happens when an alias resolves to itself or forms a cycle?
- Can an alias reference another alias (chained resolution)? (single-level vs. recursive)
- Where are aliases stored — global only, or also project-local?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an `init` command that creates a non-versioned `.bazel_git_lfs/` config directory in the current project (git-init style), with no prompts and no mirror settings.
- **FR-002**: System MUST ensure the config directory is excluded from version control (e.g., adds `.bazel_git_lfs/` to `.gitignore` when a git repository is detected).
- **FR-003**: System MUST provide a `remote` command managing mirror repository profiles, including `add`, `list`, `remove`, and default-selection capabilities.
- **FR-004**: `remote add` MUST save a namespace-tagged profile (mirror repository URL, GitLab host, Git LFS setting) in a selected scope — **project-local by default**, or **global** when the `--global` flag is given — via interactive wizard or non-interactive flags.
- **FR-005**: System MUST support two configuration scopes — **global** (user home) and **project-local** (current project) — storing profiles separately per scope.
- **FR-005a**: System MUST treat project-local configuration as taking precedence over global configuration when resolving settings (git-style layering).
- **FR-006**: System MUST designate one profile as the active default per scope, used by commands when no namespace is specified.
- **FR-007**: System MUST support a `--namespace` flag on commands that overrides the active default profile for that invocation.
- **FR-008**: System MUST resolve the effective configuration (project-local before global; active default or `--namespace` override) deterministically without interactive input at runtime.
- **FR-009**: System MUST report a clear, actionable error when a command runs with no configured profile in any scope.
- **FR-010**: System MUST NOT store, manage, or persist any Git credentials; all mirror authentication relies on the system's existing git credential helpers / SSH keys.
- **FR-011**: System MUST provide a `--help` output listing all available commands and basic usage.
- **FR-012**: System MUST support non-interactive mirror configuration so the tool can be set up in automated/CI environments.
- **FR-013**: System MUST support a global alias table (`remote.alias.<name> = <url>`) stored in the global config, and MUST provide a way to add/list/remove aliases.
- **FR-013a**: When `remote add` is given a mirror URL starting with `@`, System MUST resolve the token through the global alias table; an unknown alias MUST fail with a clear error, and a URL not starting with `@` MUST be used verbatim (no alias lookup).
- **FR-013b**: Alias resolution MUST be single-level (an alias's value is used as-is; chained `@` references are not resolved recursively) and MUST reject self/cyclic references.
- **FR-014**: `remote list` MUST support an `--effective` mode that shows the merged, actually-in-effect profile (applying scope layering and namespace/active selection), giving downstream consumers a demonstrable view of resolved configuration.
- **FR-014a**: `remote add` MUST validate mirror URL format (HTTP(S)/SSH parsing) but MUST NOT contact the remote; unreachability is only surfaced by the later sync stage.

### Key Entities

- **Config Directory**: The non-versioned `.bazel_git_lfs/` directory created by `init`; holds the project-local config (and is created per-project like `.git/`).
- **Profile**: A named set of configuration values (mirror repository URL, GitLab host, Git LFS setting) tagged by a namespace, stored in a configuration scope.
- **Namespace**: A short user-provided label that uniquely identifies a profile within a scope; used for selection via `--namespace`.
- **Scope**: The location where a profile is stored — **global** (user home) or **project-local** (current project). Project-local takes precedence.
- **Active Default Profile**: The profile used when no namespace is specified; the resolved configuration for any command run.
- **Alias**: A global name→URL mapping (`remote.alias.<name> = <url>`) used to reference mirror URLs by short token (`@<name>`) instead of a full URL.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user can initialize a project with `init` in under 30 seconds (single command, no prompts).
- **SC-002**: A first-time user can configure a mirror with `remote add` (wizard or flags) in under 2 minutes.
- **SC-003**: 100% of commands that need configuration can resolve it without interactive input once a profile exists.
- **SC-004**: Re-running `init` or `remote add` never corrupts existing profiles or the tool's operation.
- **SC-005**: The tool never stores or requests Git credentials; no credential material exists in any config file the tool writes.
- **SC-006**: A project with a project-local profile always resolves its own settings regardless of the user's global configuration, and the global configuration is never modified by project-scoped operations.
- **SC-007**: A user can configure a mirror by a short `@alias` token without pasting the full URL; 100% of aliases resolve to the correct stored URL or produce a clear error.
- **SC-008**: A user can view the effective (resolved) configuration via `remote list --effective` without knowing which scope each setting came from.

## Assumptions

- The tool is a git extension and follows git conventions: `init` creates the config area, `remote` manages mirrors, scopes layer local > global.
- **Project-local is the default scope**: configuration lands in the project's `.bazel_git_lfs/` unless `--global` is explicitly given. The user's home config area is used only when `--global` is requested (honoring a `BAZEL_GIT_LFS_HOME` override for CI/tests).
- Aliases are stored **globally only** (per the git-style clarification), so a canonical mirror location is shared across a user's projects; a project-local alias table is out of scope for this stage.
- Alias resolution is single-level: `@name` resolves to the alias's stored value verbatim; values beginning with `@` again are rejected to avoid cycles/ambiguity.
- `remote add` validates URL format only and never contacts the remote at config time (offline-friendly; connectivity is a sync-stage concern).
- The `.bazel_git_lfs/` config directory is never committed to version control.
- The mirror repository is hosted on a self-hosted GitLab that supports Git LFS (from the parent guide).
- Git and Git LFS are already installed and authenticated on the user's machine; the tool does not manage credentials.
- Configuration profiles hold only non-secret connection settings; any secret access is delegated to the system git credential chain.
- Stage 1 does not implement scanning, syncing, or mirroring; it provides the CLI skeleton, config area, and mirror-profile configuration foundation only.
