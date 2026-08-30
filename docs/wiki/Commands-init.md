# init

## Purpose

Initialize the config area for `bazel-git-lfs` in a project. Creates the `.bazel_git_lfs/` directory and updates `.gitignore`. Must be run before any other command.

## Usage

```
bazel-git-lfs init
```

## Options

No options.

## Examples

Initialize a project:

```bash
cd /path/to/your/project
bazel-git-lfs init
```

## JSON Output

```json
{ "ok": true, "configPath": "/path/to/project/.bazel_git_lfs", "message": "Initialized config area at /path/to/project/.bazel_git_lfs" }
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Config area created successfully |
| 1 | Failed to create config directory |

## Notes

- `init` is idempotent — re-running it will not overwrite existing configuration
- In a git repository, `init` also installs a pre-commit hook and updates `.gitignore`