# pull

## Purpose

Download objects from the mirror repository into the local objects store. Uses the mirror manifest to determine which objects to pull. This is the consuming end of the mirror workflow — no origin requests are made.

## Usage

```
bazel-git-lfs pull [--json]
```

## Options

| Option | Description |
|--------|-------------|
| `--json` | Output machine-readable JSON |

## Examples

Pull all objects from the mirror:

```bash
bazel-git-lfs pull
```

Get machine-readable results:

```bash
bazel-git-lfs pull --json
```

## JSON Output

```json
{
  "ok": true,
  "command": "pull",
  "projectDir": "/path/to/project",
  "objectsDir": "/path/to/project/.bazel_git_lfs/objects",
  "remote": {
    "alias": "default",
    "url": "git@github.com:my-org/mirror.git"
  },
  "results": [
    {
      "name": "react",
      "sha256": "15a019bd...",
      "status": "pulled",
      "path": "_other/.../15a019bd..."
    }
  ],
  "warnings": [],
  "summary": {
    "total": 2,
    "pulled": 2,
    "cached": 0,
    "not-in-mirror": 0,
    "failed": 0
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Pull completed successfully |
| 1 | Error during pull |

## Notes

- Objects already present and valid in the local store are reported as `cached` and skipped
- Objects not found in the mirror are reported as `not-in-mirror` — they must be pushed from a project that has them
- Pulled objects are verified against their SHA256 before being stored