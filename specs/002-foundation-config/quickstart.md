# Quickstart: bazel-git-lfs (Stage 1 — Foundation & Config)

Get the `bazel-git-lfs` CLI installed and configured. This stage provides the configuration foundation only — scanning/syncing/mirroring arrive in later stages.

## Prerequisites

- Node.js ≥ 18 and npm
- `git` and `git-lfs` installed on PATH (used by later stages; credentials via system git)

## Install / build

```bash
npm install
npm run build
```

The `bazel-git-lfs` binary becomes available (locally via `npm link` or `npx`).

## Verify the CLI surface

```bash
bazel-git-lfs --help
```

Lists all commands: `init`, `remote`, `scan`, `sync`, `verify`, `list`, `search`, `rewrite`. In this stage only `init` and `remote` are functional; the others report "not implemented in this stage".

## Initialize the config area

```bash
bazel-git-lfs init
```

Creates a non-versioned `.bazel_git_lfs/` directory in the current project (and adds it to `.gitignore` when a git repository is detected). No prompts, no mirror settings.

## Configure a mirror (interactive wizard)

```bash
bazel-git-lfs remote add
```

Follow the prompts for the mirror repository URL, GitLab host, and Git LFS setting. A project-local profile tagged `default` is saved to `.bazel_git_lfs/config.json` and becomes the active default.

## Configure non-interactively (default: project-local)

```bash
bazel-git-lfs remote add \
  --namespace ci-team \
  --mirror-repo https://gitlab.company.example/bazel/bazel-mirror.git \
  --gitlab-host gitlab.company.example \
  --lfs-enabled true
```

Works with no TTY, so scripts and CI can set up profiles deterministically. `--namespace` defaults to `default`.

## Global configuration (explicit opt-in)

Global profiles live in the user's home config area and are only written when `--global` is given:

```bash
bazel-git-lfs remote add --global \
  --mirror-repo https://gitlab.company.example/bazel/bazel-mirror.git \
  --gitlab-host gitlab.company.example
```

## Mirror URL aliases

Define a global alias once, then reference the mirror by short token:

```bash
bazel-git-lfs remote alias add company-mirror https://gitlab.company.example/bazel/bazel-mirror.git
bazel-git-lfs remote add --mirror-repo @company-mirror --gitlab-host gitlab.company.example
```

`--mirror-repo @company-mirror` is resolved through the global alias table and the resolved URL is stored. Unknown aliases fail with a clear error; URLs not starting with `@` are used verbatim.

## Scope precedence

Resolution order is **project-local first, then global** — a project-local profile overrides a global one for commands run inside the project, matching git's `--local > --global` layering.

## Manage multiple profiles

```bash
bazel-git-lfs remote list              # list profiles (project-local + global)
bazel-git-lfs remote list --effective  # show the merged, actually-in-effect profile
bazel-git-lfs remote set-default dev-env
bazel-git-lfs remote remove old-mirror
```

`remote list --effective` applies scope layering (project-local wins over global) plus namespace/active selection, and shows which scope each resolved value came from.

> Note: `remote add` validates the mirror URL's format only — it never contacts the remote. Connectivity is checked later by the sync stage.

## Isolate config (tests/advanced)

Set `BAZEL_GIT_LFS_HOME` to point at a different global config directory:

```bash
BAZEL_GIT_LFS_HOME=/tmp/my-config bazel-git-lfs remote add --global --mirror-repo ... --gitlab-host ...
```
