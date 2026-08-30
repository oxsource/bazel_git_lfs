# fetch

## Purpose

Download all dependencies from their origin URLs into the local objects store. Each dependency is verified against its declared SHA256 digest before being stored. Already-cached objects are reused without re-downloading.

## Usage

```
bazel-git-lfs fetch [--json]
```

## Options

| Option | Description |
|--------|-------------|
| `--json` | Output machine-readable JSON |

## Examples

Fetch all dependencies:

```bash
bazel-git-lfs fetch
```

Get machine-readable results:

```bash
bazel-git-lfs fetch --json
```

## JSON Output

```json
{
  "ok": true,
  "command": "fetch",
  "projectDir": "/path/to/project",
  "objectsDir": "/path/to/project/.bazel_git_lfs/objects",
  "results": [
    {
      "name": "react",
      "sha256": "15a019bd...",
      "status": "fetched",
      "path": "_other/.../15a019bd..."
    }
  ],
  "warnings": [],
  "summary": {
    "total": 2,
    "fetched": 2,
    "cached": 0,
    "failed": 0
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All dependencies fetched or cached successfully |
| 1 | One or more dependencies failed |

## Notes

- Dependencies are stored in `.bazel_git_lfs/objects/` keyed by SHA256
- Objects that fail SHA256 verification are not stored and the fetch is retried from the next URL
- The command is idempotent — re-running will only download missing or corrupt objects