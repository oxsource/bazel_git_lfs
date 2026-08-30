# clean

## Purpose

Remove the local objects store, mirror working clone, and dependency snapshot. Preserves the configuration (profiles, settings). Useful for reclaiming disk space or resetting the local state.

## Usage

```
bazel-git-lfs clean [--json]
```

## Options

| Option | Description |
|--------|-------------|
| `--json` | Output machine-readable JSON |

## Examples

Clean the local state:

```bash
bazel-git-lfs clean
```

Get machine-readable output:

```bash
bazel-git-lfs clean --json
```

## JSON Output

```json
{
  "ok": true,
  "command": "clean",
  "removed": {
    "objects": true,
    "mirror": true,
    "snapshot": true
  }
}
```

Each field indicates whether that component was present and removed. If a component was already absent, its value is `false`.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Clean completed successfully |
| 1 | Error |

## Notes

- Configuration files (`.bazel_git_lfs/config.json`) are preserved
- After `clean`, you can re-run `fetch` and `push` to re-populate the local state
- The mirror repository itself is not affected — only the local working clone is removed