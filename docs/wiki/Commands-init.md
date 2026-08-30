# init

## Purpose

Initialize the config area for `bazel-git-lfs` in a project. Creates `.bazel_git_lfs/` → `mkdir objects` → `git init` in objects with Git LFS enabled. Updates `.gitignore` and installs pre-commit hook.

## Usage

```
bazel-git-lfs init [--json]
```

## Options

| Option | Description |
|--------|-------------|
| `--json` | Output machine-readable JSON |

## Examples

```bash
cd /path/to/your/project
bazel-git-lfs init
```

## JSON Output

```json
{ "ok": true, "configPath": "/path/to/project/.bazel_git_lfs", "message": "Initialized config area at /path/to/project/.bazel_git_lfs with inner git repo at .../objects" }
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Config area created successfully |
| 1 | Failed to create config directory or initialize git repo |

## Notes

- `init` is idempotent
- Requires `git` and optionally `git-lfs` on the system PATH
- The inner `.bazel_git_lfs/objects/` repo is a standard git repository — all passthrough commands operate on it