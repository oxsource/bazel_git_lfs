# status

## Purpose

Show the mirror status for a project. Lists all dependencies and their current state relative to the mirror — whether they are present locally, mirrored, or missing. Can optionally filter by SHA256 prefix.

## Usage

```
bazel-git-lfs status [options] [keyword]
```

## Arguments

| Argument | Description |
|----------|-------------|
| `keyword` | Optional search keyword across artifact names, paths, and URLs |

## Options

| Option | Description |
|--------|-------------|
| `--sha256-prefix <hex>` | Filter by SHA256 prefix (case-insensitive) |
| `--source-url <substring>` | Filter by source URL substring (case-insensitive) |
| `--json` | Output machine-readable JSON |

## Examples

Show full status:

```bash
bazel-git-lfs status
```

Filter by SHA256 prefix:

```bash
bazel-git-lfs status --sha256-prefix 15a019bd
```

Filter by source URL:

```bash
bazel-git-lfs status --source-url github.com
```

Search by keyword:

```bash
bazel-git-lfs status react
```

Get machine-readable output:

```bash
bazel-git-lfs status --json
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Status retrieved successfully |
| 1 | Error |

## Notes

- The status command is read-only — it does not download or modify any files
- It compares the local objects store against the mirror manifest to determine each object's state