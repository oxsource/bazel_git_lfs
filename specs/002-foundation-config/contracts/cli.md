# Contracts: bazel-git-lfs CLI (Foundation & Config)

Command-line interface contracts for Stage 1 (Foundation & Config). These are the public interface of the CLI for this stage. Later stages will extend the command surface.

## Global

- Binary: `bazel-git-lfs`
- `bazel-git-lfs --help` — lists all commands with usage (FR-009).
- `bazel-git-lfs <command> --help` — command-specific help.
- `--json` (global, optional) — machine-readable JSON output for all commands.
- Exit codes: `0` success, `1` error/failure, `2` usage error.
- Errors go to stderr; structured results (when `--json`) go to stdout.

## Command: init

```
bazel-git-lfs init [--json]
```

Initializes the project config area: creates a non-versioned `.bazel_git_lfs/` directory in the current project (like `git init`). Adds `.bazel_git_lfs/` to `.gitignore` when a git repository is detected (FR-002).

- No prompts, no mirror settings, no scope selection (FR-001).
- Safe to re-run; existing `.bazel_git_lfs/` is left intact.
- **Output**: confirmation of the config directory path. With `--json`: `{ "ok": true, "configPath": "<path>" }`.

## Command: remote

```
bazel-git-lfs remote <subcommand> [args...]
```

Manages mirror-repository profiles. **Default scope is project-local** (`<cwd>/.bazel_git_lfs/config.json`); the `--global` flag targets the user home config (`~/.bazel_git_lfs/config.json`, honoring `BAZEL_GIT_LFS_HOME`).

### remote add

```
bazel-git-lfs remote add [--global] [--alias <name>] [--url <url>] [--json]
```

Creates/updates a mirror profile in the selected scope.

- **Interactive mode (default, TTY)**: If `--url` is absent and stdin is a TTY, run a guided wizard prompting for the mirror repository URL. If the wizard is interrupted (Ctrl-C), nothing is written and the command exits non-zero.
- **Non-interactive mode**: When `--url` is provided (or stdin is not a TTY), no prompts are shown; a missing `--url` is a usage error. `--alias` defaults to `default`; scope defaults to project-local unless `--global` is given.
- **Alias resolution**: if `--url` starts with `@` (e.g., `@company-mirror`), the token is resolved through the **global alias table** and the resolved URL is stored. Unknown alias → error (exit `1`) naming the alias. URLs not starting with `@` are stored verbatim. Single-level resolution: an alias value that itself starts with `@` is rejected when the alias is defined.
- **URL validation**: `--url` is validated for format only (must parse as an HTTP(S) or SSH git URL). The remote is never contacted at config time (FR-014a); unreachability surfaces at the sync stage. Git LFS is always enabled (no toggle).
- **Output**: confirmation of the saved profile alias, scope, and config file location. With `--json`: `{ "ok": true, "alias": "<name>", "scope": "local"|"global", "configPath": "<path>", "active": "<name>" }`.

### remote list

```
bazel-git-lfs remote list [--global] [--effective] [--json]
```

Lists profiles in the selected scope (default: project-local). With no scope, shows both scopes labeled. **Output**: per-profile alias, scope, and settings summary (URLs may be shown; no secrets exist).

With `--effective`: shows the **merged, actually-in-effect profile** — scope layering (project-local wins over global) then the `active` default — and notes the source scope of each resolved value (FR-014). This is the demonstrable view of `resolveConfig` for downstream consumers.

### remote remove

```
bazel-git-lfs remote remove <alias> [--global] [--json]
```

Removes the named profile from the selected scope. If it was the active default, the active marker falls back to another profile or `null`.

### remote set-default

```
bazel-git-lfs remote set-default <alias> [--global] [--json]
```

Designates the named profile as the active default in the selected scope (FR-006). There is no per-command profile-override flag; commands always use the active default (FR-007).

### remote alias

```
bazel-git-lfs remote alias add <name> <url> [--json]
bazel-git-lfs remote alias list [--json]
bazel-git-lfs remote alias remove <name> [--json]
```

Manages the **global alias table** (`remote.alias.<name> = <url>`, stored in the global config only, FR-013).

- `alias add` writes the mapping to the global config; a value beginning with `@` is rejected (single-level resolution, no chained aliases).
- `alias list` prints all aliases (names and resolved URLs).
- `alias remove` deletes the named alias.

**Behavior** (all subcommands):
- Writes are atomic (temp file + rename).
- Writing a profile with an existing alias in the same scope updates it in place.
- Project-local operations never modify the global config (SC-006).
- No credentials are ever requested or stored (FR-010).

## Command: scan / sync / verify / list / search / rewrite (stubs)

```
bazel-git-lfs <command> [args...]
```

Registered for CLI-surface stability (so `--help` lists the full planned command set per the parent guide). In this stage each stub prints a clear "not implemented in this stage" message to stderr and exits `1`.

## Config resolution (internal contract)

Not a public subcommand in this stage; exposed as an internal library for later stages:

- `resolveConfig({ scope? })` → resolved `Profile`
- Resolution order: **scope layering** (project-local wins over global) → `active` default in the winning scope → error (exit `1`) with message "No mirror configured. Run `bazel-git-lfs init` and `bazel-git-lfs remote add` first."
- Resolution never prompts and never writes (FR-008).

## Exit / error conventions

- Errors to stderr; structured errors (with `--json`) on stdout as `{ "ok": false, "error": "<message>" }`.
- Corrupted/unreadable config file → clear error naming the config path and suggesting re-running `init`.
- `remote set-default`/`remote remove` with an alias that does not exist → clear error listing the known aliases.
