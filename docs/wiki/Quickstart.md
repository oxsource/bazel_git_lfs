# Quickstart

This quickstart walks you through the complete `bazel-git-lfs` workflow. By the end, you will have mirrored dependencies from a Bazel project to a remote mirror repository.

## Prerequisites

- [[Installation|Install]] `bazel-git-lfs` (global install or npx)
- A Bazel project with `http_archive` or `http_file` dependencies (e.g., `WORKSPACE` or `MODULE.bazel` file)

## 1. Initialize

```bash
cd /path/to/your/project
bazel-git-lfs init
```

This creates the `.bazel_git_lfs/` config directory in your project and adds it to `.gitignore`.

## 2. Configure a Mirror

Add a mirror repository profile:

```bash
bazel-git-lfs remote add --url git@github.com:my-org/mirror.git
```

This creates a profile named `default` pointing to your mirror repository. You can verify it was saved:

```bash
bazel-git-lfs remote list
```

## 3. Inspect Dependencies

Scan your project for HTTP dependencies:

```bash
bazel-git-lfs inspect
```

This parses your `WORKSPACE`/`MODULE.bazel` files (and any `load()`ed `.bzl` files) and lists all `http_archive`/`http_file` dependencies with their URLs and declared SHA256 digests.

## 4. Fetch Dependencies

Download all dependencies from their origin URLs:

```bash
bazel-git-lfs fetch
```

The tool downloads each dependency, verifies its SHA256 digest, and stores the verified object in `.bazel_git_lfs/objects/`. Objects that are already cached are reused without re-downloading.

## 5. Push to Mirror

Upload the verified objects to your mirror repository:

```bash
bazel-git-lfs push
```

This copies all locally cached objects to the mirror's Git LFS store, merges their source URLs into the mirror manifest, and commits + pushes the changes. Re-running `push` is idempotent — already-mirrored objects are skipped.

## 6. Pull from Mirror

On another machine or CI runner, set up and pull from the same mirror:

```bash
bazel-git-lfs init
bazel-git-lfs remote add --url git@github.com:my-org/mirror.git
bazel-git-lfs pull
```

The tool downloads objects from the mirror repository — no requests to the original source URLs are needed.

## 7. Switch URL Sources (Optional)

If your Bazel project needs to point at different artifact sources, use `checkout`:

```bash
# Restore to original source URLs
bazel-git-lfs checkout default

# Switch to local file:// paths (useful for offline work)
bazel-git-lfs checkout local

# Switch to a named profile's mirror URL
bazel-git-lfs checkout my-profile
```

## Next Steps

- See [[Commands]] for the full command reference
- See [[Configuration]] for detailed profile and alias setup
- See [[Troubleshooting]] for common issues and solutions