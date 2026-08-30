# fetch

## Purpose

Passthrough to `git -C .bazel_git_lfs/objects fetch <args>`. Fetches objects from the configured remote into the inner git repository.

## Usage

```
bazel-git-lfs fetch <remote> [<branch>] [git-fetch-options...]
```

All arguments are passed through to `git fetch` in the inner repo.

## Examples

```bash
bazel-git-lfs fetch origin
bazel-git-lfs fetch origin main
```

## Notes

- `fetch` is a passthrough command — it delegates to `git -C .bazel_git_lfs/objects fetch`
- Internally, the inner repo uses Git LFS for large object storage