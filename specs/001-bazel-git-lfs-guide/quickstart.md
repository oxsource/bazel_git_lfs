# Quickstart: bazel-git-lfs

Get started mirroring Bazel remote HTTP dependencies into a shared Git LFS repository.

## Prerequisites

- Node.js ≥ 18 and npm
- `git` and `git-lfs` installed on PATH
- A self-hosted GitLab repository (e.g., `bazel/bazel-mirror`) with Git LFS enabled

## Install

```bash
npm install -g bazel-git-lfs
```

Or as a project devDependency:

```bash
npm install --save-dev bazel-git-lfs
```

## Initialize

```bash
cd my-bazel-project
bazel-git-lfs init
```

Creates `.bazel_git_lfs/` config area and updates `.gitignore`.

## Configure a mirror remote

```bash
bazel-git-lfs remote add --alias prod --url git@gitlab.example.com:bazel/bazel-mirror.git
bazel-git-lfs remote set-default prod
```

## Discover dependencies

```bash
bazel-git-lfs inspect
```

Lists discovered `http_archive`/`http_file` dependencies with their URLs and SHA256. Nothing is downloaded or changed.

## Fetch and mirror

```bash
bazel-git-lfs fetch     # download from source URLs
bazel-git-lfs push      # upload to Git LFS mirror
```

## Pull from a teammate's mirror

```bash
bazel-git-lfs pull
```

## Check mirror integrity

```bash
bazel-git-lfs status                          # all artifacts
bazel-git-lfs status --sha256-prefix ab12     # filter by SHA256
bazel-git-lfs status --source-url github      # filter by source URL
bazel-git-lfs status abseil                   # search by keyword
```

## Reset local state (keep config)

```bash
bazel-git-lfs clean
```

## Point project at the mirror

```bash
bazel-git-lfs checkout prod        # switch to remote mirror URLs
bazel-git-lfs checkout local       # switch to local HTTP server (port 8022)
bazel-git-lfs checkout default     # restore to original source URLs
```

## Publish a new release

```bash
npm version patch        # or minor/major
npm publish              # publishes to the public npm registry
```