# remote

## Purpose

Passthrough to `git -C .bazel_git_lfs/objects remote <args>`. Manage mirror repository remotes in the inner git repo. After a successful `remote add`, the tool outputs a branch naming suggestion.

## Usage

```
bazel-git-lfs remote add <name> <url>
bazel-git-lfs remote remove <name>
bazel-git-lfs remote -v
```

All arguments are passed through to `git remote` in the inner repo.

## Examples

```bash
# Add a remote (passthrough + branch suggestion)
bazel-git-lfs remote add origin git@github.com:org/mirror.git
# → Suggested branch format: org_mirror_<feature>

# List remotes
bazel-git-lfs remote -v
```

## Notes

- `remote` is a passthrough command — it delegates to `git -C .bazel_git_lfs/objects remote`
- After successful `remote add`, the tool parses the URL and suggests a branch naming convention