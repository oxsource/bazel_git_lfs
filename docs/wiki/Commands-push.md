# push

## Purpose

Upload locally cached and verified objects from the local objects store to the mirror repository. Also merges source URLs into the mirror manifest and commits + pushes the changes to the mirror.

## Usage

```
bazel-git-lfs push [--json]
```

## Options

| Option | Description |
|--------|-------------|
| `--json` | Output machine-readable JSON |

## Examples

Push all locally cached objects to the mirror:

```bash
bazel-git-lfs push
```

Get machine-readable results:

```bash
bazel-git-lfs push --json
```

## JSON Output

```json
{
  "ok": true,
  "command": "push",
  "projectDir": "/path/to/project",
  "remote": {
    "alias": "default",
    "url": "git@github.com:my-org/mirror.git"
  },
  "commit": "abc123def...",
  "pushed": true,
  "results": [
    {
      "name": "react",
      "sha256": "15a019bd...",
      "status": "uploaded"
    }
  ],
  "warnings": [],
  "summary": {
    "total": 2,
    "uploaded": 2,
    "already-mirrored": 0,
    "missing-local": 0,
    "failed": 0
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Push completed successfully (or nothing to push) |
| 1 | Error during push |

## Notes

- Objects that are already mirrored are reported as `already-mirrored` and skipped
- Objects that are not present locally are reported as `missing-local` — the push continues with other objects
- The command is idempotent — re-running on an already up-to-date mirror produces no new commit (`pushed: false`)