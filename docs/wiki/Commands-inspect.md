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