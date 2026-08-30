# remote

## Purpose

Manage mirror repository profiles and URL aliases. The `remote` command has several subcommands for adding, listing, and removing profiles, as well as managing global URL aliases.

## Usage

```
bazel-git-lfs remote add [--global] [--alias <name>] [--url <url>] [--json]
bazel-git-lfs remote set-default [--global] <alias>
bazel-git-lfs remote remove [--global] <alias>
bazel-git-lfs remote list [--global] [--effective] [--json]
bazel-git-lfs remote alias add <name> <url>
bazel-git-lfs remote alias list [--json]
bazel-git-lfs remote alias remove <name>
```

## Options

| Option | Description |
|--------|-------------|
| `--global` | Target the global (user home) config instead of project-local |
| `--alias <name>` | Profile alias name (default: `default`) |
| `--url <url>` | Mirror repository URL (may be `@alias`) |
| `--effective` | Show the resolved active profile (local overrides global) |
| `--json` | Output machine-readable JSON |

## Examples

Add a local profile:

```bash
bazel-git-lfs remote add --url git@github.com:my-org/mirror.git
```

Add a profile with a custom alias:

```bash
bazel-git-lfs remote add --alias team --url git@github.com:team/mirror.git
```

Add a global profile:

```bash
bazel-git-lfs remote add --global --url git@github.com:org/mirror.git
```

Set the active profile:

```bash
bazel-git-lfs remote set-default team
```

List profiles:

```bash
bazel-git-lfs remote list
bazel-git-lfs remote list --effective
bazel-git-lfs remote list --json
```

Remove a profile:

```bash
bazel-git-lfs remote remove team
```

Manage URL aliases:

```bash
bazel-git-lfs remote alias add company git@gitlab.company.com:bazel/mirror.git
bazel-git-lfs remote alias list
bazel-git-lfs remote alias remove company
```

## JSON Output

```json
{ "ok": true, "alias": "default", "scope": "local", "configPath": "/path/to/.bazel_git_lfs/config.json", "active": "default", "message": "Saved mirror profile \"default\" (local) at /path/to/.bazel_git_lfs/config.json" }
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (e.g., invalid URL, missing alias) |
| 2 | Usage error (invalid arguments) |

## Notes

- Profiles are stored in JSON format in the config file
- Local profiles take precedence over global profiles when resolving the effective configuration
- The `--alias` value defaults to `default` when not specified
- `default` and `local` are reserved aliases and cannot be used as profile names