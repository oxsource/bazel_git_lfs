# Quickstart

**Date**: 2026-08-30 | **Phase**: 1 (Design)

This quickstart walks you through the complete `bazel-git-lfs` workflow. By the end, you'll have mirrored dependencies from a Bazel project to a remote mirror repository and consumed them in another project.

## Prerequisites

- Node.js ≥ 18
- `git` and `git-lfs` installed
- A Bazel project with `http_archive` or `http_file` dependencies

## 1. Install

```bash
npm install -g bazel-git-lfs
```

Verify installation:

```bash
bazel-git-lfs --version
```

## 2. Initialize

```bash
cd /path/to/your/project
bazel-git-lfs init
```

This creates `.bazel_git_lfs/` in your project and updates `.gitignore`.

## 3. Configure a Mirror

Add a mirror repository profile:

```bash
bazel-git-lfs remote add --url git@github.com:my-org/mirror.git
```

This creates a profile named `default` pointing to your mirror repository.

## 4. Inspect Dependencies

```bash
bazel-git-lfs inspect
```

This scans your `WORKSPACE`/`MODULE.bazel` files and lists all `http_archive`/`http_file` dependencies.

## 5. Fetch Dependencies

```bash
bazel-git-lfs fetch
```

This downloads each dependency from its origin URL, verifies the SHA256, and stores it in `.bazel_git_lfs/objects/`.

## 6. Push to Mirror

```bash
bazel-git-lfs push
```

This uploads the verified objects to your mirror repository, along with a manifest of source URLs.

## 7. Pull from Mirror

On another machine or CI runner:

```bash
bazel-git-lfs init
bazel-git-lfs remote add --url git@github.com:my-org/mirror.git
bazel-git-lfs pull
```

This downloads the objects from the mirror — no origin requests needed.

## 8. Checkout URL Sources

```bash
# Restore to original source URLs
bazel-git-lfs checkout default

# Switch to local file:// paths
bazel-git-lfs checkout local

# Switch to a profile's remote URL
bazel-git-lfs checkout my-profile
```

## Next Steps

- See the [Installation](Installation) guide for detailed install options
- See [Commands](Commands) for the full command reference
- See [Troubleshooting](Troubleshooting) for common issues