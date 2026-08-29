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

## Configure

```bash
bazel-git-lfs init
```

Sets the mirror repository URL, cache directory, and git/lfs paths in the local config.

## Scan a project (read-only)

```bash
bazel-git-lfs scan ./graph_runtime
```

Lists discovered `http_archive`/`http_file` dependencies with their URLs and SHA256. Nothing is downloaded or changed.

## Mirror dependencies

```bash
bazel-git-lfs sync ./graph_runtime ./cpp_network ./medias
```

Downloads missing artifacts, verifies SHA256, caches them, and pushes to the mirror. Identical content is stored once.

## Verify mirror integrity

```bash
bazel-git-lfs verify
```

## Query the mirror

```bash
bazel-git-lfs list
bazel-git-lfs search abseil
```

## Point a project at the mirror (opt-in)

```bash
bazel-git-lfs checkout ./graph_runtime        # dry-run: previews changes
bazel-git-lfs checkout ./graph_runtime --apply  # writes mirror URLs
```

`checkout` only touches URLs for artifacts already in the mirror, and only writes files when `--apply` is given.

## Publish a new release

```bash
npm version patch        # or minor/major
npm publish              # publishes to the public npm registry
```