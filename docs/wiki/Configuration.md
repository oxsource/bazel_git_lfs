# Configuration

## Config File Location

`bazel-git-lfs` stores its configuration in a JSON file. The location depends on the scope:

| Scope | Path |
|-------|------|
| Project-local | `<project>/.bazel_git_lfs/config.json` |
| Global | `~/.bazel_git_lfs/config.json` (or `$BAZEL_GIT_LFS_HOME/config.json`) |

## Config File Format

```json
{
  "active": "default",
  "profiles": {
    "default": {
      "alias": "default",
      "url": "git@github.com:my-org/mirror.git",
      "createdAt": "2026-01-15T10:00:00.000Z",
      "updatedAt": "2026-01-15T10:00:00.000Z"
    }
  },
  "aliases": {
    "company": "git@gitlab.company.com:bazel/mirror.git"
  }
}
```

## Profile Management

Profiles define mirror repository URLs. Each profile has a name (alias) and a URL.

### Scopes

Profiles can be stored in two scopes:

- **Local** (project-level): Stored in the project's `.bazel_git_lfs/config.json`. Used by default when running commands from within a project directory.
- **Global** (user-level): Stored in `~/.bazel_git_lfs/config.json`. Applied with the `--global` flag.

When resolving the effective configuration, local profiles take precedence over global profiles.

### Commands

```bash
# Add a profile (local by default)
bazel-git-lfs remote add --url git@github.com:my-org/mirror.git

# Add a profile with a custom alias
bazel-git-lfs remote add --alias team --url git@github.com:team/mirror.git

# Add a profile globally
bazel-git-lfs remote add --global --url git@github.com:org/mirror.git

# Set the active profile
bazel-git-lfs remote set-default team

# List profiles
bazel-git-lfs remote list
bazel-git-lfs remote list --effective  # Show resolved active profile
bazel-git-lfs remote list --json       # Machine-readable output

# Remove a profile
bazel-git-lfs remote remove team
```

## URL Aliases

URL aliases let you reference mirror URLs by a short name. Aliases are stored globally and can be referenced anywhere a URL is expected using the `@` prefix.

```bash
# Add an alias
bazel-git-lfs remote alias add company git@gitlab.company.com:bazel/mirror.git

# Use the alias when adding a profile
bazel-git-lfs remote add --url @company

# List aliases
bazel-git-lfs remote alias list

# Remove an alias
bazel-git-lfs remote alias remove company
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BAZEL_GIT_LFS_HOME` | Override the global config directory path (default: `~/.bazel_git_lfs`) |

## Reserved Aliases

The following aliases are reserved and cannot be used as profile names:

| Alias | Purpose |
|-------|---------|
| `default` | The default profile name for `remote add` when no `--alias` is given |
| `local` | Reserved for the `checkout local` command |

## Pre-commit Hook

When you run `bazel-git-lfs init` in a git repository, the tool installs a pre-commit hook at `.git/hooks/pre-commit`. This hook automatically runs `bazel-git-lfs checkout default` before each commit if a non-default checkout state is detected, preventing non-default URLs from being committed.

## Project-local INI Config (`.bazelconfig`)

Beyond `config.json` (remote/profiles/aliases), `bazel-git-lfs` reads a lightweight **INI-style** config from `.bazel_git_lfs/.bazelconfig`. This file is project-local only and manages behavior-level settings that previously were hard-coded.

### File Location

```
.bazel_git_lfs/.bazelconfig
```

If the file is absent, all settings fall back to their defaults.

### Supported Keys

| Key | Default | Description |
|-----|---------|-------------|
| `server.port` | `8022` | Port used by the local object HTTP server (`checkout @`). |
| `inspect.exclude` | *(none)* | Dependency names (exact match) to exclude from archiving during `inspect`. |
| `inspect.append` | *(none)* | Manually-added dependencies that the scan missed, one per entry. |

### Syntax

The format mirrors git config:

- `[section]` blocks, `key = value` assignments.
- `#` / `;` start comments; inline `#` after a value is a comment.
- Arrays support **two styles**, which can be combined:
  - `key = [a, b]` — comma-separated array literal.
  - `key += c` — append another value (or `+= [d, e]`).

### Example

```ini
# .bazel_git_lfs/.bazelconfig

[server]
port = 9022

[inspect]
# Don't archive these scanned dependencies (exact name match).
exclude = some_unwanted_dep
exclude += another_dep

# Manually add dependencies the scan missed.
# Format: name|urls(comma-separated)|sha256[|stripPrefix]
append = manual_dep|https://example.org/m.tar.gz|a1b2c3d4...e5f6
append += other_dep|https://example.org/o.tar.gz|f6e5...d4c3|third_party
```

### Behavior

- `inspect.exclude` / `inspect.append` are applied to the scan result before the snapshot is written, so `inspect -u` archiving and later reads stay consistent.
- Invalid values (e.g. a non-numeric `server.port`) are ignored and the default is used.
- `inspect.append` entries use the same fields as a scanned dependency; `stripPrefix` is optional (omit it when not needed).