# Data Model: Foundation & Config

Entities from the feature spec. Storage is isolated behind the `ProfileStore` interface (G4); the JSON file layout below is the V1 fs-backed implementation. Configuration is scoped (git-style): **project-local** (default) and **global**, with project-local taking precedence.

## Entity: Profile

A named set of configuration values tagged by an alias.

- `alias` (string, required) — unique label identifying the profile. *Validation: non-empty, `[a-zA-Z0-9._-]`, no path separators.*
- `url` (string, required) — the shared Git LFS mirror repository URL. *Validation: must parse as a valid HTTP(S) or SSH git URL.* The GitLab host is derived from the URL host when needed.
- `createdAt` / `updatedAt` (string, ISO timestamp) — audit metadata.

**Identity / uniqueness**: unique by `alias`. Writing a profile with an existing alias updates it in place (spec Edge Cases: same-alias overwrite is the intended behavior for `remote add` re-runs).

## Entity: Config File (fs-backed store)

The on-disk representation: a `config.json` per scope. Two files may exist simultaneously:

- Project-local (default scope): `<project>/.bazel_git_lfs/config.json`
- Global (explicit `--global`): `~/.bazel_git_lfs/config.json` (honoring `BAZEL_GIT_LFS_HOME`)

Each holds:

- `active` (string|null) — alias of the active default profile within that scope; `null` when none exists.
- `profiles` (map) — `alias → Profile` object.
- `aliases` (map, global only) — `name → url` mirror alias table (`remote.alias.*`).

```json
{
  "active": "default",
  "profiles": {
    "default": {
      "alias": "default",
      "url": "https://gitlab.company.example/bazel/bazel-mirror.git",
      "createdAt": "2026-08-29T00:00:00.000Z",
      "updatedAt": "2026-08-29T00:00:00.000Z"
    }
  },
  "aliases": {
    "company-mirror": "https://gitlab.company.example/bazel/bazel-mirror.git"
  }
}
```

**Scope precedence**: for a given setting, project-local wins over global (FR-005a). Resolution merges the two scopes: start with the global profile, overlay the project-local profile, then use the `active` default in the winning scope. A missing file in a scope simply contributes nothing. The merged result is the **effective profile**, exposed for viewing via `remote list --effective` (FR-014). The active default is changed via `remote set-default <alias>` (FR-006); there is no per-command override flag (FR-007).

**Alias table**: stored in the global config only. `remote add --url @<name>` resolves `<name>` against this table and stores the resolved URL in the profile. Single-level resolution: an alias value beginning with `@` is invalid (rejected to avoid cycles). Unknown alias → clear error naming the alias.

**Integrity**: each file is written atomically (temp file + rename). Any read that fails parse or schema validation is reported as a clear error naming the config path (FR-009 / corruption edge case).

## State transitions

- `none (no config)` → `profile saved (remote add, in a scope)` → `profile active (active set in that scope)`
- `profile` may be updated in place by re-running `remote add` with the same alias in the same scope (updatedAt bumped).
- A project-local profile may shadow a global profile without modifying it (SC-006).
- There is no delete flow in this stage (out of scope).

## Relationships

- Each **Config File** (per scope) holds zero or more **Profiles**.
- Exactly zero or one **Profile** is the **active default** within each scope.
- The **effective Profile** for a command is project-local profile, else global profile (FR-005a); the `active` default applies within the winning scope.
- A **Profile** never contains credential material (FR-010, SC-005); auth is delegated to system git.
