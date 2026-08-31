# inspect

## Purpose

Scan Bazel project files for HTTP dependencies. Parses `WORKSPACE`, `WORKSPACE.bazel`, and `MODULE.bazel` files (plus any `load()`ed `.bzl` files) and extracts `http_archive`/`http_file` rules with their URLs, SHA256 digests, and strip prefixes.

Results are cached in `.bazel_git_lfs/dependencies.json`. Use `-f` to force re-scan.

## Usage

```
bazel-git-lfs inspect [-f]
```

## Options

| Option | Description |
|--------|-------------|
| `-f, --force` | Force re-scan even if cached snapshot exists |

## Examples

First scan (or re-scan):

```bash
bazel-git-lfs inspect -f
```

Cached print (fast):

```bash
bazel-git-lfs inspect
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Inspection completed successfully |
| 1 | Error |

## Notes

- Results are cached in `.bazel_git_lfs/dependencies.json`
- `inspect` is read-only — it does not download or modify any files
- The cached output is the raw JSON file contents

## Filtering & Manual Additions (`.bazelconfig`)

You can override the scanned result via the project-local INI config `.bazel_git_lfs/.bazelconfig`:

- **`inspect.exclude`** — dependency names (exact match) to drop from archiving. Useful for scanned deps you don't want to store.
- **`inspect.append`** — manually add dependencies the scan missed. Format: `name|urls(comma-separated)|sha256[|stripPrefix]`.

```ini
[inspect]
exclude = some_unwanted_dep
append = manual_dep|https://example.org/m.tar.gz|a1b2c3d4...e5f6
```

These are applied before the snapshot is written, so `inspect -u` archiving and later runs stay consistent. See [Configuration](Configuration.md) for the full `.bazelconfig` syntax.