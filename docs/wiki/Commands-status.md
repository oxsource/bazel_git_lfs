# status

## Purpose

Passthrough to `git -C .bazel_git_lfs/objects status <args>`. Shows the working tree status of the inner git repository.

## Usage

```
bazel-git-lfs status [git-status-options...]
```

All arguments are passed through to `git status` in the inner repo.

## Examples

```bash
bazel-git-lfs status
```

## Notes

- `status` is a passthrough command — it delegates to `git -C .bazel_git_lfs/objects status`
- Shows the status of dependency files tracked in the inner git repo