# init

## Purpose

Initialize the config area for `bazel-git-lfs` in a project. Creates `.bazel_git_lfs/` → `mkdir objects` → `git init` in objects with Git LFS enabled. Updates `.gitignore` and installs pre-commit hook.

## Usage

```
bazel-git-lfs init [--json] [--with-bazelconfig]
```

## Options

| Option | Description |
|--------|-------------|
| `--json` | Output machine-readable JSON |
| `--with-bazelconfig` | Write a `.bazelconfig` template into the config area (`.bazel_git_lfs/.bazelconfig`). An existing file is left untouched. |

## Examples

```bash
cd /path/to/your/project
bazel-git-lfs init
bazel-git-lfs init --with-bazelconfig
```

## JSON Output

With `--with-bazelconfig`, the result includes a `bazelconfigPath` field when the template is written:

```json
{ "ok": true, "configPath": "/path/to/project/.bazel_git_lfs", "bazelconfigPath": "/path/to/project/.bazel_git_lfs/.bazelconfig", "message": "Initialized config area at /path/to/project/.bazel_git_lfs with inner git repo at .../objects and wrote .bazelconfig template at .../.bazelconfig" }
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Config area created successfully |
| 1 | Failed to create config directory, initialize git repo, or write the `.bazelconfig` template |

## Notes

- `init` is idempotent
- `--with-bazelconfig` never overwrites an existing `.bazel_git_lfs/.bazelconfig` — it only writes the template when the file does not exist
- Requires `git` and optionally `git-lfs` on the system PATH
- The inner `.bazel_git_lfs/objects/` repo is a standard git repository — all passthrough commands operate on it