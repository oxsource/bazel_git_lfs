# Research: Foundation & Config

Phase 0 research decisions resolving the technical unknowns for Stage 1 (Foundation & Config).

## 1. Config directory discovery & scope layering

**Decision**: Model the tool as a git extension with two scopes: **project-local** at `<cwd>/.bazel_git_lfs/config.json` (the **default** scope) and **global** at `~/.bazel_git_lfs/config.json` (used only when `--global` is explicitly given). Resolution order: project-local first, then global (project-local wins), mirroring git's `--local > --global` precedence. Honor `BAZEL_GIT_LFS_HOME` env override for the global location (used by CI/tests to isolate config). Resolve via `os.homedir()`.

**Rationale**: The parent guide fixes a user-level config area, but per the clarification the tool defaults to **project-local** scope (like `git config` without `--global` writes to the repo-local config). A project-local default keeps all configuration inside the project's non-versioned `.bazel_git_lfs/`, with global as an explicit opt-in via `--global` (FR-004). This enables per-team/per-project mirror settings without disturbing personal defaults.

**Alternatives considered:** Global-only (rejected — no per-project override); global-default with `--local` opt-in (rejected per clarification — user wants local default); XDG config home (deviates from the guide's stated location).

## 2. Profile storage format

**Decision**: A single `config.json` under the config directory holding `{ active, profiles: { <alias>: { url, ... } }, aliases: { <name>: <url> } }`. Written atomically (write temp file + rename).

**Rationale**: One file is simpler to reason about and validate than one file per alias; atomic write prevents the corruption edge case (spec Edge Cases). `active` names the default profile.

**Alternatives considered:** One file per alias + index file — more filesystem churn, no benefit at this scale; JSONC/TOML — JSON is standard, no parser dependency.

## 3. Profile file validation & corruption handling

**Decision**: Validate schema on every read (required fields present, URL format check, alias non-empty). On parse/schema failure, report a clear error naming the config path and instruct re-running `init` (spec FR-009 / Edge Cases: corrupted config).

**Rationale**: FR-007 requires actionable errors; deterministic resolution (FR-006) demands validation at read time, not lazily.

**Alternatives considered:** Auto-repair/reset on corruption — silently discards user data; not acceptable.

## 4. Interactive wizard vs non-interactive mode

**Decision**: Use the `prompts` library for interactive mode when stdin is a TTY; when `--url` is provided (or stdin is not a TTY), run non-interactively without prompting. Default alias `default`, default scope `local`. Applies to the `remote add` subcommand (mirror configuration), not to `init` (which never prompts).

**Rationale**: FR-001/FR-012 (wizard and non-interactive) are both required on `remote add`; a TTY check + explicit flags gives deterministic behavior in both paths. `init` is deliberately prompt-free (FR-001).

**Alternatives considered:** Always prompt (fails in CI); always flags (loses the guided UX required by the spec). The hybrid satisfies both.

## 5. Effective-config resolution order

**Decision**: Resolution order: scope layering first (project-local wins over global), then the `active` default in the winning scope → error with "No mirror configured. Run `bazel-git-lfs init` and `bazel-git-lfs remote add` first." if no profiles exist in any scope. Runtime resolution is pure file read + validation, no prompts. There is no per-command profile-override flag; the active default is chosen via `remote set-default <alias>` (FR-006/FR-007).

**Rationale**: Matches FR-005a/FR-006/FR-007/FR-008/FR-009 exactly, keeps resolution deterministic for later stages, and mirrors git's layered config semantics.

**Alternatives considered:** Auto-creating a profile at first use — masks missing-init errors; rejected (FR-009 wants an explicit error). Global-only resolution — ignores project-local precedence. Per-command override flag — rejected per clarification; `remote set-default` is the single selection mechanism.

## 6. Credential handling

**Decision**: The config layer stores no credential fields at all; no prompts ever ask for tokens/passwords. Mirror auth is entirely the system `git` credential helper / SSH chain's responsibility.

**Rationale**: FR-008 and SC-005 are explicit; storing even an "optional token" field invites misuse. SC-005 asserts no credential material exists in any config file the tool writes — provable by schema inspection.

**Alternatives considered:** Optional encrypted token store — scope creep, contradicts "lightweight" (G5), and the parent guide delegates auth to git.

## 7. CLI skeleton & help

**Decision**: Commander with subcommands; `init` and `remote` fully implemented; `scan`/`sync`/`verify`/`list`/`search`/`rewrite` registered as stubs that print "not implemented in this stage" and exit non-zero. Global `--json` flag and `--help` per the parent guide contract.

**Rationale**: FR-011 requires `--help` listing all commands; registering stubs keeps the CLI surface stable so later stages slot in without breaking the contract (`contracts/cli.md`).

**Alternatives considered:** Only registering `init` and `remote` — `--help` would omit planned commands, diverging from the parent contract.

## 8. Global mirror aliases

**Decision**: Store a global alias table in the global config file (`aliases: { <name>: <url> }`, exposed via `remote alias add/list/remove`). When `remote add` receives `--mirror-repo @<name>`, resolve `<name>` in the global alias table and store the **resolved URL** in the profile. Resolution is **single-level**: values are used verbatim; an alias value that itself starts with `@` is rejected as invalid (prevents cycles/ambiguity). URLs not starting with `@` are used verbatim with no lookup.

**Rationale**: FR-013/FR-013a/FR-013b. A global-only table (per the clarification) gives a canonical, user-shared mirror location while keeping project-local config minimal. Storing the resolved URL (not the token) keeps downstream resolution simple and deterministic.

**Alternatives considered:** Resolving lazily at every read (keeps the token in the profile but makes resolution depend on global state at runtime); recursive/chained aliases (ambiguous and harder to reason about); project-local alias tables (out of scope per clarification). Storing the resolved URL at add-time is simplest and most predictable.

## 9. URL validation depth

**Decision**: `remote add` validates the mirror URL **format only** — it must parse as an HTTP(S) or SSH git URL. No network request, no `git ls-remote`, no reachability probe at config time.

**Rationale**: FR-014a. Config time should stay offline-friendly and instant (SC-002 under 2 minutes); a probe adds latency, flakiness, and requires credentials that must not be stored (FR-010). Reachability is a runtime concern for the sync stage, not configuration.

**Alternatives considered:** `git ls-remote` on add (network dependency + credential interaction at config time — rejected); no validation at all (lets typos through — rejected, format check is cheap and catches obvious errors).

## 10. Effective-config display

**Decision**: `remote list --effective` computes and shows the merged, actually-in-effect profile: apply scope layering (project-local wins over global), then the `active` default, and annotate each value's source scope. Shares the same internal `resolveConfig` used by later stages.

**Rationale**: FR-014 / US5. It gives a demonstrable, user-visible path for config resolution in this stage (and a natural place to test `resolveConfig` end-to-end), without adding a separate command surface.

**Alternatives considered:** A dedicated `config show` command (extra surface); internal-library-only resolution with no CLI view (nothing to demonstrate acceptance scenario 1 of US5). `--effective` on `remote list` reuses existing surface.

## 8. Testing strategy

**Decision**: Vitest. Unit tests for `paths`/`profile`/`store`/`resolve`; integration tests run `init`/`remote add` end-to-end with `BAZEL_GIT_LFS_HOME` pointed at a temp dir (covers wizard non-interactive path + active-default resolution); contract tests assert `--help`/`init`/`remote` schemas and the `config.json` file format.

**Rationale**: Hermetic via env override (research 1); contract tests pin the CLI interface per the parent guide's contract approach.

**Alternatives considered:** Node test runner (less ergonomic for CLI fixtures); Jest (heavier). No.
