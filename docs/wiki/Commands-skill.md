# skill

## Purpose

Scaffold GitHub Actions workflows into the **host repository** (the git repo the tool runs in). The repository name used in the generated workflow is derived from `git remote get-url origin` — the same logic as the `remote add` branch hook.

`skill` is designed to be extended: `github.workflow` is the first built-in skill, `list` shows what is available.

## Usage

```text
bazel-git-lfs skill github.workflow
bazel-git-lfs skill list
```

## Skills

| Skill             | Description                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github.workflow` | npm-version-style tag-push release: on a `v*` tag, build a source tarball (`git archive`) and upload it to a GitHub Release. Writes `.github/workflows/release.yml`. |
| `list`            | List the available skills                                                                                                                                            |

## Examples

```bash
# Generate the version workflow into the host repo and auto-commit it
bazel-git-lfs skill github.workflow

# List available skills
bazel-git-lfs skill list
```

## Behavior

- The workflow file is only written when it does **not** already exist; otherwise a warning is printed and nothing changes (exit code 0).
- When the file is written, a commit is created automatically (`chore: add .github/workflows/release.yml`). If the auto-commit fails, a warning is printed but the command still succeeds.

## Exit Codes

| Code | Meaning                                                                    |
| ---- | -------------------------------------------------------------------------- |
| 0    | Success (including the "already exists — skipped" case)                    |
| 1    | Not a git repository, or the repository name could not be detected from origin |

## Notes

- Requires the host directory to be inside a git repository.
- Requires a configured `origin` remote so the repository name can be derived.
- New skills can be added later; run `bazel-git-lfs skill list` to see the current set.
