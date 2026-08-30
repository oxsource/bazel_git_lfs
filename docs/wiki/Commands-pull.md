# pull

## Purpose

Passthrough to `git -C .bazel_git_lfs/objects pull <args>`. Pulls commits and LFS objects from the remote into the inner git repository.

## Usage

```
bazel-git-lfs pull <remote> [<branch>] [git-pull-options...]
```

All arguments are passed through to `git pull` in the inner repo.

## Examples

```bash
bazel-git-lfs pull origin
bazel-git-lfs pull origin main
```

## Notes

- `pull` is a passthrough command — it delegates to `git -C .bazel_git_lfs/objects pull`
- LFS objects are materialized automatically via the Git LFS filter