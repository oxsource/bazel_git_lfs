<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/009-mirror-upstream-flow/plan.md` and the task list at
`specs/009-mirror-upstream-flow/tasks.md`.

## Architecture Overview

bazel-git-lfs uses an interception/passthrough pattern:
- `.bazel_git_lfs/objects/` is an inner git repo managed via Git LFS
- Only 4 custom commands: `init`, `inspect`, `clean`, `checkout`
- `checkout` is hybrid: `--`/`@` → custom logic; `<branch>` → git passthrough + custom patch
- All other `bazel-git-lfs <args>` pass through to `git -C .bazel_git_lfs/objects <args>`
- Pre-hooks add upstream checks before fetch/push/pull passthrough
- Post-hooks add branch suggestion after remote add passthrough
<!-- SPECKIT END -->
