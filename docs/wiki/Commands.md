# Commands

This page lists all `bazel-git-lfs` commands. The tool uses an **interception/passthrough** architecture: only 4 commands are custom; all others pass through to `git -C .bazel_git_lfs/objects <args>`.

## Custom Commands

| Command | Description |
|---------|-------------|
| [[Commands-init\|init]] | Initialize `.bazel_git_lfs/` + inner git repo at `objects/` |
| [[Commands-inspect\|inspect]] | Scan Bazel project files for HTTP dependencies (cached, use `-f` to force re-scan) |
| [[Commands-clean\|clean]] | Remove the entire `.bazel_git_lfs/` directory |
| [[Commands-checkout\|checkout]] | Hybrid: `--`/`@` → custom URL replacement; `<branch>` → git checkout + patch |

## Passthrough Commands

All other commands delegate to `git -C .bazel_git_lfs/objects <args>`:

| Command | Passthrough Target |
|---------|-------------------|
| `fetch` | `git fetch` |
| `push` | `git push` |
| `pull` | `git pull` |
| `remote` | `git remote` (with post-hook: branch naming suggestion) |
| `status` | `git status` |
| `log` | `git log` |
| `branch` | `git branch` |
| `add` | `git add` |
| `commit` | `git commit` |
| ... | any other git command |

## Command Summary

### `init`

```text
bazel-git-lfs init [--json]
```

Creates `.bazel_git_lfs/` → `mkdir objects` → `git init` in objects with LFS enabled. Updates `.gitignore`.

### `inspect`

```text
bazel-git-lfs inspect [-f]
```

Scans Bazel project files for remote HTTP dependencies and writes snapshot to `.bazel_git_lfs/dependencies.json`. If cached snapshot exists, prints it directly. Use `-f` to force re-scan.

### `clean`

```text
bazel-git-lfs clean
```

Removes the entire `.bazel_git_lfs/` directory, including the inner git repo.

### `checkout`

```text
bazel-git-lfs checkout <alias>
```

| Alias | Behavior |
|-------|----------|
| `default` or `--` | Custom URL replacement — restore original source URLs |
| `local` or `@` | Custom URL replacement — switch to `file://` paths |
| `<branch>` | `git -C .bazel_git_lfs/objects checkout <branch>` + custom patch |

### `remote add`

```text
bazel-git-lfs remote add <name> <url>
```

Passthrough to `git -C .bazel_git_lfs/objects remote add`. After success, outputs branch naming suggestion: `<group>_<repo>_<feature>`.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error |
| 2 | Usage error |

## JSON Output

Custom commands output JSON with an `ok` field. Passthrough commands output raw git output.