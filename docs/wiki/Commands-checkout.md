# checkout

## Purpose

Rewrite dependency URL declarations in Bazel project files (`WORKSPACE`, `WORKSPACE.bazel`, `MODULE.bazel`) to point at different target sources based on the given alias. Useful for switching between original source URLs, local file paths, and mirror URLs.

## Usage

```
bazel-git-lfs checkout <alias>
```

## Aliases

| Alias | Target | Description |
|-------|--------|-------------|
| `default` or `--` | Original source URLs | Restore URLs to the original source URLs from the mirror manifest |
| `local` or `@` | Local file paths | Switch to `file://` paths under `.bazel_git_lfs/objects/` |
| `<profile-name>` | Profile remote URL | Switch to that profile's configured remote mirror URL |

## Examples

Restore to original source URLs:

```bash
bazel-git-lfs checkout default
```

Switch to local file paths:

```bash
bazel-git-lfs checkout local
```

Switch to a named profile:

```bash
bazel-git-lfs checkout my-profile
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Checkout completed successfully |
| 1 | Error (e.g., manifest required for `default`, objects store missing for `local`) |

## Notes

- `checkout` writes changes directly to Bazel files — no dry-run mode
- A pre-commit hook (installed by `init`) automatically runs `checkout default` before commits to prevent non-default URLs from being committed
- `checkout default` requires the mirror manifest to be available
- `checkout local` requires the objects store to exist
- The command is idempotent — re-running with the same alias produces no changes