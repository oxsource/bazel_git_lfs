# Feature Specification: Stage 5 — Business Project Checkout

**Feature Branch**: `006-business-checkout`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "Stage 5: Business Project Checkout (S5) — checkout command that rewrites Bazel project URLs to mirror URLs"

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this stage implements [Stage 5 (Business Project Checkout)](../001-bazel-git-lfs-guide/plan.md), covering FR-011a/FR-011b/FR-013 of the parent spec.

## Clarifications

### Session 2026-08-29

- Q: When init installs a pre-commit git hook, and checkout --apply has been run, how should the hook behave? → A: The hook warns that checkout has been applied, runs checkout default (restore) automatically, and prints what changed; commit proceeds afterwards.
- Q: CLI syntax for checkout targets → A: `bazel-git-lfs checkout <alias>`. No project directory argument, no --apply flag. `<alias>` is one of: `default` (restore to original URLs), `@` (switch to local file:// paths under .bazel_git_lfs/), or any configured profile alias (switch to that remote URL). The command writes directly — no dry-run mode.
- Q: Is --apply flag needed? → A: No. checkout <alias> directly applies the URL changes without a separate apply flag.
- Q: Reserved alias design → A: `default` and `@` are built-in reserved aliases for checkout. `--` is a shorthand for `default`, and `@` is a shorthand for `local`. When configuring profiles via `remote add`, the system MUST check for conflicts with these reserved keywords and report an error. These reserved constants should be defined in a shared module.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Switch project URLs to a target source (Priority: P1)

A user runs `bazel-git-lfs checkout <alias>` to switch the project's dependency URLs to a different source. The alias specifies the target: `default` (or shorthand `--`) restores original source URLs, `@` (or `local`) switches to local file:// paths under `.bazel_git_lfs/objects/`, and a named alias switches to that profile's configured remote URL. The tool reads the mirror manifest and config profiles, resolves the target URLs, and directly rewrites the Bazel project files. After execution, the tool prints a confirmation listing which files were modified and how many URLs were changed.

**Why this priority**: This is the core checkout action — the entire feature. Users need one command to switch between URL sources. Safety is handled by the pre-commit hook (US2) rather than a dry-run mode.

**Independent Test**: Run checkout against a fixture project with each alias type; assert the files are updated to the correct target URLs, a confirmation summary is printed, and nothing else is changed.

**Acceptance Scenarios**:

1. **Given** a Bazel project with artifacts in the mirror, **When** the user runs `checkout <profile-alias>`, **Then** the matching dependency URLs are rewritten to that alias's remote URL.
2. **Given** a Bazel project at original URLs, **When** the user runs `checkout @` or `checkout local`, **Then** the URLs are rewritten to local file:// paths under `.bazel_git_lfs/`.
3. **Given** a project whose URLs have been rewritten, **When** the user runs `checkout default` or `checkout --`, **Then** the mirror/local URLs are replaced with the original source URLs from the mirror manifest.
4. **Given** a project already at the target URLs, **When** the user runs `checkout <alias>`, **Then** the tool reports no changes needed (idempotent).
5. **Given** a Bazel project with multiple dependency declaration files (WORKSPACE and MODULE.bazel), **When** the user runs `checkout <alias>`, **Then** all matching URLs across all files are updated.
6. **Given** a project with some dependencies not in the target scope, **When** the user runs `checkout <alias>`, **Then** only matching dependencies are changed; others remain as-is.
7. **Given** any checkout execution, **When** the command completes, **Then** it prints a confirmation summary listing the files modified, URLs changed, and a per-dependency breakdown.

---

### User Story 2 — Pre-commit hook auto-restore on init (Priority: P2)

A user runs `bazel-git-lfs init` which installs a pre-commit git hook in the project. Before each commit, the hook checks whether `checkout <alias>` has been previously executed for a non-default alias. If it has, the hook automatically runs `checkout default` to revert URLs back to original source URLs, prints what was restored, and allows the commit to proceed. This ensures no non-default URLs are accidentally committed to the project's git history.

**Why this priority**: Safety net — prevents non-default URLs from leaking into commits. Lower priority than the core checkout command because the feature works without it.

**Independent Test**: After init + checkout <alias>, attempt a git commit; assert the hook runs checkout default automatically and the commit succeeds with original URLs restored.

---

### Edge Cases

- What happens when the project directory does not exist or is not a Bazel project? (error: operate on current project only — no project directory argument; check current dir for Bazel files)
- What happens when the mirror is not configured or not accessible? (error: mirror must be set up first)
- What happens when the mirror manifest is empty (no artifacts mirrored yet)? (report that no URLs can be rewritten)
- What happens when a Bazel file has syntax errors? (report the error and skip that file, continue with others)
- What happens when the same dependency URL appears multiple times in the same file? (all occurrences are rewritten consistently)
- What happens when the user runs `checkout` without an alias argument? (usage error, exit 2)
- What happens when the user runs `checkout <unknown-alias>` where the alias is not `default`, `@`, or a configured profile? (error: unknown alias, exit non-zero)
- How does the tool handle `http_file` vs `http_archive` declarations? (both are supported — any URL declaration is a candidate)
- What happens when the user runs `checkout default` on a project that was never checked out? (no-op, reports no changes)
- What happens when the mirror manifest is missing during `checkout default`? (error: manifest required to find original URLs)
- What happens when `checkout @` runs but `.bazel_git_lfs/objects/` does not exist? (error: local store not populated)
- What happens when `init` is re-run on an already-initialized project? (the pre-commit hook is idempotently reinstalled)
- Does the pre-commit hook require git to be installed? (yes — the hook is a git pre-commit hook; init installs it only if the project is a git repository)
- What happens if the pre-commit hook fails (e.g., checkout default errors)? (the hook prints the error and exits non-zero, blocking the commit)
- What happens when a user tries to `remote add` with alias `default` or `local`? (error: reserved alias, cannot be used for profile names)
- Does `checkout default` work the same as `checkout --`? (yes — `--` is a shorthand for `default`; both are equivalent)
- Does `checkout local` work the same as `checkout @`? (yes — `local` is an alias for `@`; both switch to file:// paths)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `checkout` command that accepts an alias as a positional argument.
- **FR-002**: `checkout` MUST support alias values: `default` (or shorthand `--`), `local` (or shorthand `@`), and any configured profile alias.
- **FR-003**: `default` (and `--`) MUST restore dependency URLs to their original source URLs as recorded in the mirror manifest.
- **FR-004**: `local` (and `@`) MUST switch dependency URLs to local file:// paths under `.bazel_git_lfs/`.
- **FR-005**: A configured profile alias MUST switch dependency URLs to that profile's configured remote URL.
- **FR-006**: `checkout` MUST directly write the URL changes — no dry-run or preview mode.
- **FR-007**: `checkout` MUST only modify the `urls` declarations in Bazel dependency files (WORKSPACE, MODULE.bazel). No other parts of the project files may be modified.
- **FR-008**: `checkout` MUST be idempotent: re-running with the same alias on an already-checked-out project reports no changes needed.
- **FR-009**: `checkout` MUST output a confirmation summary after execution, listing which files were modified, how many URLs were changed, and a per-dependency breakdown of before/after URLs.
- **FR-010**: `checkout` MUST exit non-zero if any error occurs (mirror not accessible, unknown alias, etc.).
- **FR-011**: `checkout` MUST require an initialized config area (`init`) and a configured mirror remote profile.
- **FR-012**: `checkout` MUST support both `http_archive` and `http_file` dependency declarations in WORKSPACE and MODULE.bazel files.
- **FR-013**: `default`, `--`, `local`, and `@` MUST be defined as reserved aliases in a shared constants module accessible across the codebase.
- **FR-014**: System MUST reject `remote add` or `remote alias add` commands that attempt to create a profile named `default` or `local`, with a clear error message about reserved keywords.
- **FR-015**: `init` MUST install a git pre-commit hook in the project that checks whether `checkout <alias>` has been executed with a non-default alias.
- **FR-016**: The pre-commit hook MUST automatically run `checkout default` if checkout state is detected, print the restored changes, and allow the commit to proceed.
- **FR-017**: The pre-commit hook MUST block the commit (exit non-zero) if `checkout default` itself fails.
- **FR-018**: The pre-commit hook MUST be idempotent — re-running `init` reinstalls it without side effects.

### Key Entities

- **CheckoutResult**: The result of a checkout operation — list of applied URL changes, list of unchanged dependencies (not in target scope), and any errors encountered.
- **Mirror Manifest**: The authoritative inventory of mirrored artifacts (from Stage 3). Keyed by SHA256, each entry records the mirror path and source URLs. Used to resolve target URLs for `default` and `<profile-alias>` targets.
- **CheckoutState**: A marker indicating whether `checkout <alias>` has been executed with a non-default alias. The pre-commit hook reads this to decide whether to auto-restore. Stored in the project config area (`.bazel_git_lfs/`).
- **ReservedAliases**: A shared constants module defining the built-in aliases: `default` (with shorthand `--`) and `local` (with shorthand `@`). Used by both `checkout` and `remote` commands to validate alias names.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `checkout default` (or `--`) correctly restores all previously rewritten URLs back to their original source URLs, leaving other files untouched.
- **SC-002**: `checkout local` (or `@`) correctly rewrites all matching URLs to local file:// paths under `.bazel_git_lfs/`, leaving non-matching dependencies untouched.
- **SC-003**: `checkout <profile-alias>` correctly rewrites all matching URLs to that alias's configured remote URL.
- **SC-004**: `checkout` is idempotent — re-running with the same alias reports no changes and makes no modifications.
- **SC-005**: Only the `urls` declarations in Bazel files are modified; no other content in the project is changed.
- **SC-006**: `checkout` prints a confirmation summary after execution showing files modified, URLs changed count, and per-dependency before/after URLs.
- **SC-007**: `remote add` rejects profile names `default` and `local` with a clear error message.
- **SC-008**: The pre-commit hook installed by `init` successfully detects checkout state, runs `checkout default`, and prints a summary of restored URLs before allowing the commit to proceed.

## Assumptions

- `checkout` reads the mirror manifest from the LFS working clone (same as Stage 3/4 commands); the working clone must be accessible.
- `checkout` requires a configured remote profile (to locate the mirror working clone).
- The mirror manifest is authoritative — only dependencies listed in the manifest can be rewritten.
- Bazel project files use standard `http_archive`/`http_file` syntax with `urls` or `url` attributes.
- `checkout` operates on the current project directory (no project-directory argument — consistent with other commands).
- `checkout` does not modify the mirror manifest or any objects; it is read-only with respect to the mirror.
- URL rewriting is a simple string replacement — no content transformation or re-hashing is needed.
- The tool does not need to parse the full Bazel grammar; it uses pattern matching to find and replace URL declarations.
- `checkout default` reads original URLs from the mirror manifest's `sources[]` field (primary URL is the restore target).
- `checkout local` maps to local file:// paths derived from `.bazel_git_lfs/objects/` using the same path derivation as Stage 3.
- `default` and `local` (with their shorthands `--` and `@`) are reserved aliases defined in a shared constants module. No profile may be named `default` or `local`.
- Checkout state is tracked via a simple marker in `.bazel_git_lfs/` — no additional infrastructure needed.
- The pre-commit hook is installed only when the project is a git repository (git rev-parse succeeds).
- The pre-commit hook calls the local `bazel-git-lfs` binary using its installed path (same as the CLI entry point).