# clean

## Purpose

Remove the entire `.bazel_git_lfs/` directory, including the inner git repository, config, and snapshot.

## Usage

```
bazel-git-lfs clean
```

## Examples

```bash
bazel-git-lfs clean
```

## JSON Output

```json
{ "ok": true, "command": "clean", "removed": "/path/to/project/.bazel_git_lfs" }
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Clean completed successfully |
| 1 | Error |

## Notes

- Removes the entire `.bazel_git_lfs/` directory — config, objects, inner git repo, and snapshot
- After `clean`, you can re-run `init` to start fresh
- The remote mirror repository is not affected