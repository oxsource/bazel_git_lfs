# Research: Business Project Checkout

Phase 0 research decisions. No NEEDS CLARIFICATION markers existed in the spec; all decisions are grounded in existing Stages 1–4 abstractions and the parent guide.

## 1. Checkout mechanics

**Decision**: `checkout <alias>` reads the mirror manifest (via `ArtifactRepository.readManifest()`), resolves the target URL per alias type, then rewrites `urls` declarations in WORKSPACE/MODULE.bazel using pattern matching. The alias resolution:

- `default`/`--`: Reads the manifest's `sources[]` field (primary URL) for each dependency. Replaces any current URL (mirror, local, or remote) with the original source URL.
- `local`/`@`: Derives local file:// paths using the same `deriveObjectPath` logic from Stage 3's `objects/object-path.ts`. The local path is `file://<projectDir>/.bazel_git_lfs/objects/<derived-path>`.
- `<profile-alias>`: Resolves the alias to a remote URL via `ConfigResolver.resolveEffective()`, then replaces URLs with that remote + the manifest's mirror path.

**Rationale**: FR-001–FR-012. Reusing `ArtifactRepository.readManifest()`, `deriveObjectPath`, and `ConfigResolver` from earlier stages avoids duplication and keeps the architecture consistent. Pattern matching (rather than full Bazel grammar parsing) is sufficient for the standard `http_archive`/`http_file` syntax and follows the lightweight principle (G5).

**Alternatives considered:** Full Starlark AST parsing (over-engineered — the standard patterns are simple enough for regex-like matching, G5); using a separate state file for original URLs (unnecessary — the manifest already stores source URLs, FR-009).

## 2. Reserved alias validation

**Decision**: Reserved aliases `default` and `local` (with shorthands `--` and `@`) are defined as constants in `src/mirror/alias.ts`. Both `checkout` and `remote add` validate against this module. The `remote add` command checks the alias name before creating the profile and rejects with a clear error message.

**Rationale**: FR-013/FR-014. A shared constants module ensures consistency across commands. Early validation in `remote add` prevents confusing errors later.

**Alternatives considered:** Hardcoding checks in each command (duplication risk — rejected); validating only at checkout time (poor UX — rejected).

## 3. Checkout state tracking

**Decision**: A simple JSON file `.bazel_git_lfs/checkout-state.json` records the alias last used with `checkout --apply`. The pre-commit hook reads this file. If it exists and contains a non-default alias, the hook runs `checkout default`. The file is removed when `checkout default` runs.

**Rationale**: FR-015/FR-016. Minimal state — just a marker file. No additional infrastructure needed.

**Alternatives considered:** Inspecting Bazel file URLs directly to determine checkout state (fragile — URLs could be changed manually, rejected).

## 4. URL rewriting engine

**Decision**: The rewriting engine parses WORKSPACE and MODULE.bazel files line by line. For each `http_archive`/`http_file` declaration, it matches the `urls` or `url` attribute and replaces the URL value. The engine preserves formatting (indentation, line breaks) and only modifies the URL string itself. Multiple occurrences of the same URL in a file are all replaced consistently.

**Rationale**: FR-006/FR-007. Simple pattern matching is sufficient for the standard Bazel dependency syntax. Preserving formatting avoids unnecessary diffs.

**Alternatives considered:** Full file rewrite (would change formatting — rejected, causes noisy diffs); AST-based replacement (over-engineered for the simple patterns — rejected, G5).

## 5. Pre-commit hook

**Decision**: `init` installs a pre-commit hook script at `.git/hooks/pre-commit`. The hook script calls `bazel-git-lfs checkout default --json` and checks the exit code. If the checkout actually changed files (not idempotent), it prints the confirmation summary. If the hook fails, it exits non-zero and blocks the commit.

**Rationale**: FR-015–FR-018. Standard git hook mechanism. Idempotent reinstall via `init`.

**Alternatives considered:** Using a git hook manager (unnecessary dependency — rejected, G5); always running checkout (would slow down every commit — rejected, only runs when state file exists).

## 6. Output & exit conventions

**Decision**: Same as Stages 2–4: JSON-only stdout with `--json`, human-readable by default, `{ ok: false, error }` for errors, non-zero exit. `checkout` result shape: `{ ok, command: "checkout", alias, target, changes: [{ file, dependency, before, after }], changed: number, unchanged: number }`. Confirmation summary is printed to stdout in human-readable mode.

**Rationale**: FR-009/FR-010 + consistency with the existing CLI contracts.