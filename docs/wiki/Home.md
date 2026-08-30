# bazel-git-lfs

**bazel-git-lfs** is a lightweight CLI tool that discovers, downloads, verifies, and mirrors Bazel remote HTTP dependencies (`http_archive`/`http_file` in `WORKSPACE`/`MODULE.bazel`) using an inner git repository managed via Git LFS.

## Architecture

The tool uses an **interception/passthrough** pattern. `.bazel_git_lfs/objects/` is an inner git repository. Only 4 commands are custom (`init`, `inspect`, `clean`, `checkout`); all others pass through to `git -C .bazel_git_lfs/objects <args>`.

## Quick Start

```bash
npm install -g bazel-git-lfs
cd /path/to/your/project
bazel-git-lfs init
bazel-git-lfs inspect
bazel-git-lfs remote add origin git@github.com:my-org/mirror.git
bazel-git-lfs fetch origin main
```

See the [[Quickstart]] for a complete walkthrough.

## Getting Started

| Page | Description |
|------|-------------|
| [[Installation]] | System requirements, npm install, verify installation |
| [[Quickstart]] | Step-by-step tutorial for the complete workflow |

## Command Reference

| Page | Description |
|------|-------------|
| [[Commands-init\|init]] | Create `.bazel_git_lfs/` + inner git repo |
| [[Commands-inspect\|inspect]] | Scan Bazel files for dependencies (cached) |
| [[Commands-clean\|clean]] | Remove entire `.bazel_git_lfs/` directory |
| [[Commands-checkout\|checkout]] | Hybrid: `--`/`@` → URL replacement; `<branch>` → git + patch |
| [[Configuration]] | Config file format, profiles, aliases, environment variables |
| [[Architecture]] | Interception/passthrough, inner git repo, flow diagrams |
| [[Troubleshooting]] | Common errors, causes, and solutions |
| [[CI-CD]] | Using bazel-git-lfs in CI/CD pipelines |

> **Passthrough commands**: `fetch`, `push`, `pull`, `remote`, `status`, `log`, `branch`, `add`, `commit` — all delegate to `git -C .bazel_git_lfs/objects <args>`.