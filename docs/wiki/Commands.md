# Commands

This page lists all `bazel-git-lfs` commands. Each command has a dedicated page with syntax, options, examples, and output format.

## Core Workflow

| Command | Description |
|---------|-------------|
| [[Commands-init\|init]] | Initialize the config area (`.bazel_git_lfs/`) in a project |
| [[Commands-remote\|remote]] | Manage mirror repository profiles and URL aliases |
| [[Commands-inspect\|inspect]] | Scan Bazel project files for HTTP dependencies |
| [[Commands-fetch\|fetch]] | Download dependencies from their origin URLs |
| [[Commands-push\|push]] | Upload verified objects to the mirror repository |
| [[Commands-pull\|pull]] | Download objects from the mirror repository |
| [[Commands-status\|status]] | Show mirror status and verify object integrity |
| [[Commands-clean\|clean]] | Remove local objects store, mirror clone, and snapshot |
| [[Commands-checkout\|checkout]] | Rewrite dependency URLs in Bazel files to a target source |

## Command Summary

### `init`

```text
bazel-git-lfs init
```

Creates `.bazel_git_lfs/` config directory and updates `.gitignore`. Must be run before any other command.

### `remote`

```text
bazel-git-lfs remote add [--global] [--alias <name>] [--url <url>] [--json]
bazel-git-lfs remote set-default [--global] <alias>
bazel-git-lfs remote remove [--global] <alias>
bazel-git-lfs remote list [--global] [--effective] [--json]
bazel-git-lfs remote alias add <name> <url>
bazel-git-lfs remote alias list [--json]
bazel-git-lfs remote alias remove <name>
```

### `inspect`

```text
bazel-git-lfs inspect [--json]
```

### `fetch`

```text
bazel-git-lfs fetch [--json]
```

### `push`

```text
bazel-git-lfs push [--json]
```

### `pull`

```text
bazel-git-lfs pull [--json]
```

### `status`

```text
bazel-git-lfs status [<sha256-prefix>] [--json]
```

### `clean`

```text
bazel-git-lfs clean [--json]
```

### `checkout`

```text
bazel-git-lfs checkout <alias>
```

## Aliases

The `checkout` command supports these built-in aliases:

| Alias | Target |
|-------|--------|
| `default` or `--` | Restore to original source URLs from the mirror manifest |
| `local` or `@` | Switch to local `file://` paths under `.bazel_git_lfs/objects/` |
| `<profile-name>` | Switch to that profile's configured remote URL |

## Exit Codes

All commands follow the same exit code convention:

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (check the error message) |
| 2 | Usage error (invalid arguments or options) |

## JSON Output

All commands support `--json` for machine-readable output. The JSON output always includes an `ok` field (`true`/`false`). On error, an `error` field provides the error message.