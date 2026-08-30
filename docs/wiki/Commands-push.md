# push

## Purpose

Passthrough to `git -C .bazel_git_lfs/objects push <args>`. Pushes commits and LFS objects from the inner git repository to the remote.

## Usage

```
bazel-git-lfs push <remote> [<branch>] [git-push-options...]
```

All arguments are passed through to `git push` in the inner repo.

## Examples

```bash
bazel-git-lfs push origin main
```

## Notes

- `push` is a passthrough command — it delegates to `git -C .bazel_git_lfs/objects push`
- LFS objects are pushed automatically via the Git LFS filter