# Feature Specification: Mirror Upstream Flow

**Feature Branch**: `009-mirror-upstream-flow`

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description: "1.项目中的mirror采用Merge-Request的方式合入主线，好处是初始时可以是一个空仓库，而不是完整的远端仓库。这就需要在fetch,pull,push前检查上游remote是否存在，以及是否可用；2.git remote add 远程后，可以提示用户绑定上游，通过上游仓库地址给出分支建议；比如：git@github.com:oxsource/bazel_git_lfs.git，就按<group>_<reponame>_[feature]之类的方式组织分支名；3.此三个命令应该还要能指定上游仓库及分支，首次fetch和pull会提示需要set-upstream；"

## Clarifications

### Session 2026-08-30

- Q: Core architecture approach → A: Wrap git commands on `.bazel_git_lfs/objects` (inner git repo). Commands like remote, pull, fetch, push are wrappers around git commands operating on this inner repo. Use a pass-through/interception mechanism: custom logic for operations that need it, direct git passthrough for the rest. `init` creates both the config area and the inner `.git` directory inside `objects/`. This is a major design refactoring.
- Q: Pass-through mechanism shape → A: Transparent passthrough with an interception registry. Any unrecognized `bazel-git-lfs <arg>` is treated as `git -C .bazel_git_lfs/objects <arg>`. Commands registered in the interception registry run custom logic; all others pass through transparently.
- Q: Which commands need custom interception → A: Only `init`, `inspect`, `clean`. All other commands (fetch, push, pull, status, checkout, remote, etc.) pass through transparently to `git -C .bazel_git_lfs/objects`. The `objects/` directory is the inner git repository managed via Git LFS for storing archived dependency files.
- Q: Passthrough target directory → A: All passthrough git commands operate on `.bazel_git_lfs/objects/`, not `.bazel_git_lfs/` itself. The `objects/` directory IS the inner git repo (`git -C .bazel_git_lfs/objects`).
- Q: init steps → A: `init` creates `.bazel_git_lfs/` directory, then `mkdir objects`, then `cd objects && git init` (with Git LFS enabled). Sequential: config area → objects dir → inner git repo.
- Q: inspect purpose → A: `inspect` scans Bazel project files for remote HTTP dependencies and stores the snapshot (dependencies.json) in `.bazel_git_lfs/` directory.
- Q: checkout needs → A: `checkout` must be intercepted as a hybrid. `--` (original/default) and `@` (local) use our custom URL replacement logic directly. Other remote/branch arguments first execute `git -C .bazel_git_lfs/objects checkout ...`, then run our custom replacement/patch logic.

## User Scenarios & Testing

### User Story 1 - Upstream Health Check Before Mirror Operations (Priority: P1)

A user runs `bazel-git-lfs fetch`, `pull`, or `push` and expects the tool to verify that the configured upstream remote (Git LFS mirror) exists and is reachable before attempting any data transfer. Since these commands pass through transparently to `git -C .bazel_git_lfs/objects`, the upstream check runs as a pre-hook before delegation. If the remote is missing or unreachable, the tool reports a clear error and halts before the git command runs.

**Why this priority**: Without this check, operations fail silently or with confusing errors when the remote is missing — a core safety requirement for the Merge-Request workflow where the remote may be empty or not yet configured.

**Independent Test**: Can be tested by configuring a non-existent remote URL on the inner `.bazel_git_lfs/objects/.git` repo and running fetch/pull/push — the tool must report the remote is unreachable before delegating to git.

**Acceptance Scenarios**:

1. **Given** the inner `.bazel_git_lfs/objects/.git` repo has a configured remote that does not exist on the server, **When** the user runs `bazel-git-lfs fetch`, **Then** the tool reports "Remote mirror not found or unreachable" and exits without delegating to `git -C .bazel_git_lfs/objects fetch`.
2. **Given** the inner `.bazel_git_lfs/objects/.git` repo has a configured remote that is reachable, **When** the user runs `bazel-git-lfs push`, **Then** the tool passes through to `git -C .bazel_git_lfs/objects push`.
3. **Given** the inner `.bazel_git_lfs/objects/.git` repo has no remote configured, **When** the user runs `bazel-git-lfs pull`, **Then** the tool reports "No mirror remote configured" and suggests running `bazel-git-lfs remote add` first (which passes through to `git -C .bazel_git_lfs/objects remote add`).

---

### User Story 2 - Upstream Binding and Branch Suggestion (Priority: P2)

After adding a mirror remote via `bazel-git-lfs remote add` (which passes through to `git -C .bazel_git_lfs/objects remote add`), the interceptor runs a post-hook to prompt the user to bind the upstream and suggest a branch naming convention derived from the remote URL. For example, given `git@github.com:oxsource/bazel_git_lfs.git`, the tool suggests branch names like `oxsource_bazel-git-lfs_feature` or `oxsource_bazel-git-lfs_fix`.

**Why this priority**: Automates the naming convention setup and reduces configuration errors, especially important for teams using structured branch naming across multiple projects.

**Independent Test**: Can be tested by running `remote add` with a valid URL and verifying the tool displays the suggested branch name format and configures the remote on the inner `objects/.git` repo.

**Acceptance Scenarios**:

1. **Given** a user runs `bazel-git-lfs remote add --url git@github.com:oxsource/bazel_git_lfs.git`, **When** the command passes through to `git -C .bazel_git_lfs/objects remote add ...`, **Then** the tool outputs a suggestion: "Bind upstream? Suggested branch format: oxsource_bazel-git-lfs_<feature>".
2. **Given** the user accepts the binding suggestion, **When** they confirm, **Then** the tool sets the remote as default upstream in the inner `objects/.git` repo.
3. **Given** a user runs `remote add` with a URL that does not match the expected pattern, **When** the command completes, **Then** the tool still adds the remote to the inner `objects/.git` repo but skips branch suggestion.

---

### User Story 3 - Set-Upstream for Fetch, Pull, Push (Priority: P1)

The `fetch`, `pull`, and `push` commands pass through transparently to `git -C .bazel_git_lfs/objects fetch`, `git -C .bazel_git_lfs/objects pull`, and `git -C .bazel_git_lfs/objects push`. Before delegation, the interception layer checks if upstream is configured on the inner `objects/.git` repo and prompts if missing. On first invocation without a configured upstream, the tool prompts the user to set the upstream, similar to Git's `git push --set-upstream` behavior.

**Why this priority**: This is the core mechanic that enables the Merge-Request workflow — users need to specify where to push/pull from, and the inner `objects/.git` repo remembers the choice for subsequent operations via standard git tracking.

**Independent Test**: Can be tested by running `fetch` without `--remote` when no upstream is configured on the inner `objects/.git` — the tool must prompt to set upstream. Running `fetch` again after setting upstream must proceed without the prompt.

**Acceptance Scenarios**:

1. **Given** no upstream is configured on the inner `.bazel_git_lfs/objects/.git` repo, **When** the user runs `bazel-git-lfs fetch`, **Then** the tool prompts: "No upstream configured. Set upstream? (remote: <default>, branch: <default>)" and then passes through to `git -C .bazel_git_lfs/objects fetch <remote> <branch>`.
2. **Given** the user specifies `--remote origin --branch main` with `bazel-git-lfs push`, **When** the operation succeeds, **Then** the tool stores these as the default upstream in the inner `objects/.git` repo (via `git branch --set-upstream-to`) and passes through to `git -C .bazel_git_lfs/objects push`.
3. **Given** an upstream is already configured on the inner `objects/.git`, **When** the user runs `bazel-git-lfs pull`, **Then** the tool passes through to `git -C .bazel_git_lfs/objects pull` without prompting.
4. **Given** a user runs `bazel-git-lfs fetch --remote another-remote --branch dev`, **When** the operation completes, **Then** the tool passes through to `git -C .bazel_git_lfs/objects fetch another-remote dev`, using the specified remote and branch for this operation only.

---

### Edge Cases

- What happens when the inner `.bazel_git_lfs/objects/.git` repo gets corrupted? The tool should detect this on `init` guard and offer to reinitialize.
- How does the tool handle the case where the outer project's `.gitignore` already excludes `.bazel_git_lfs/`? It should ensure the inner `objects/.git` is not accidentally exposed (though it's already excluded).
- What happens when the remote URL is valid but the user lacks write permissions? The tool should report the permission error clearly from the git command output.
- How does the tool handle branches that exist on the remote but not on the inner `objects/.git` repo? Standard git fetch/pull behavior applies.
- What happens when the user runs `remote add` with an already-configured remote on the inner `objects/.git`? The tool should detect the duplicate and confirm before overwriting.
- How does the system handle network timeouts during upstream validation? The tool should retry once and then report a clear timeout error.

## Requirements

### Functional Requirements

- **FR-001**: `init` MUST create `.bazel_git_lfs/` config area, then create `objects/` subdirectory inside it, then run `git init` inside `.bazel_git_lfs/objects/` to initialize the inner git repo with Git LFS enabled.
- **FR-002**: System MUST implement an interception registry with exactly four custom commands: `init` (create config area + inner git repo), `inspect` (scan Bazel dependencies, store snapshot in `.bazel_git_lfs/`), `clean` (remove `.bazel_git_lfs/`), and `checkout` (hybrid: first git passthrough if remote/branch given, then custom URL replacement/patch). All other commands transparently pass through to `git -C .bazel_git_lfs/objects <args>`.
- **FR-003**: Before passing through `fetch`, `pull`, or `push`, the system MUST verify the upstream remote exists and is reachable via `git -C .bazel_git_lfs/objects ls-remote <remote>`. If not, report a clear error and halt.
- **FR-004**: System MUST report a clear, actionable error message when the upstream remote is missing or unreachable.
- **FR-005**: After `remote add` (passthrough to `git -C .bazel_git_lfs/objects remote add`), system MUST prompt the user to bind the upstream and suggest a branch naming convention derived from the remote URL.
- **FR-006**: The suggested branch naming convention MUST follow the format `<group>_<reponame>_<feature>` based on the remote URL path.
- **FR-007**: `fetch`, `pull`, and `push` commands MUST accept optional `--remote` and `--branch` flags, which map to the inner `objects/.git` repo's remote and branch, and pass through to `git -C .bazel_git_lfs/objects <cmd> <remote> <branch>`.
- **FR-008**: On first invocation of `fetch`, `pull`, or `push` without an upstream configured on the inner `objects/.git`, the system MUST prompt the user to set the upstream before passing through.
- **FR-009**: When the user sets upstream via `--remote` and `--branch` flags, the system MUST persist those values as the default for future operations on the inner `objects/.git` (e.g., via `git branch --set-upstream-to`).
- **FR-010**: When `--remote` and `--branch` are specified but upstream is already configured, the system MUST use the specified values for the current operation only, without overwriting the stored default.
- **FR-011**: The `objects/` directory under `.bazel_git_lfs/` IS the inner git repository. Archived dependency files are tracked and managed via Git LFS inside this repo.
- **FR-012**: `checkout` MUST intercept and handle `--` (original/default) and `@` (local) with custom URL replacement logic. For other remote/branch arguments, MUST first pass through to `git -C .bazel_git_lfs/objects checkout <remote/branch>`, then execute custom replacement/patch logic.
- **FR-013**: System MUST detect duplicate remote configurations on the inner `objects/.git` and prompt for confirmation before overwriting (passthrough with pre-check).

### Key Entities

- **Inner Git Repo**: The `.bazel_git_lfs/objects/` directory IS a git repository (has `objects/.git/` dir). All passthrough git operations (remote, fetch, push, pull, status, checkout, branch, etc.) are delegated to this repo via `git -C .bazel_git_lfs/objects`.
- **Git LFS Objects Store**: The `.bazel_git_lfs/objects/` directory simultaneously serves as the git repo AND the Git LFS object store. Archived dependency files are tracked in this repo via Git LFS.
- **Upstream Config**: The remote and branch configuration on the inner `objects/.git` repo, managed via standard git commands (`git -C .bazel_git_lfs/objects remote`, `git -C .bazel_git_lfs/objects branch --set-upstream-to`).
- **Remote Profile**: A mirror repository configuration stored as a git remote on the inner `objects/.git` repo.
- **Branch Suggestion**: A derived naming convention based on the remote URL, formatted as `<group>_<reponame>_<feature>`.
- **Pass-Through Interceptor**: An interception registry with exactly four custom commands: `init` (create `.bazel_git_lfs/` → `mkdir objects` → `git init` in objects with Git LFS), `inspect` (scan Bazel files, write snapshot to `.bazel_git_lfs/`), `clean` (remove `.bazel_git_lfs/`), `checkout` (hybrid: `--`/`@` use custom logic; other args → git passthrough + custom patch). All other `bazel-git-lfs <args>` transparently pass through to `git -C .bazel_git_lfs/objects <args>`, with optional pre-hooks (e.g., upstream health check before fetch/push/pull).

## Success Criteria

### Measurable Outcomes

- **SC-001**: `bazel-git-lfs init` creates a functional `.git` repo inside `.bazel_git_lfs/` that can accept git remote and branch operations.
- **SC-002**: Users can complete a `fetch`, `pull`, or `push` operation without prior remote configuration in under 30 seconds, including the upstream setup prompt.
- **SC-003**: After upstream is configured on the inner `.git` once, subsequent operations proceed without any prompts or delays.
- **SC-004**: When an invalid remote URL is configured, the tool reports the error within 5 seconds and provides a clear next-step suggestion.
- **SC-005**: The branch naming suggestion accurately parses the remote URL into the correct `<group>_<reponame>` prefix for at least 95% of standard Git remote URL formats.
- **SC-006**: Error messages for missing/unreachable remotes contain the remote name and a suggested fix (e.g., "Run `bazel-git-lfs remote add <name> <url>` to configure").
- **SC-007**: Existing commands (fetch, push, pull, status, clean, checkout, inspect) continue to work identically for users who do not use the new upstream flow — backward compatibility is maintained.

## Assumptions

- Users have network connectivity when running fetch, pull, or push operations.
- The mirror repository uses Git LFS and is hosted on a standard Git server (GitHub, GitLab, self-hosted, etc.).
- Branch naming conventions follow the pattern `<group>_<reponame>_<feature>` where group and reponame are extracted from the remote URL path.
- The inner `.bazel_git_lfs/objects/.git` repo is excluded from the outer project's git tracking via `.gitignore` (`.bazel_git_lfs/` already excluded).
- Backward compatibility with existing `.bazel_git_lfs/` directories (without inner `objects/.git`) is maintained via auto-migration on first command.
- The pass-through mechanism transparently delegates unrecognized `bazel-git-lfs <args>` to `git -C .bazel_git_lfs/objects <args>`. Only `init`, `inspect`, `clean`, and `checkout` are registered as custom commands.
- The `.bazel_git_lfs/objects/` directory is both a git repository and a Git LFS object store managed via `git lfs track`.