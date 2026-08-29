# Quickstart: Recursive External Dependency Discovery & Checkout

**Feature**: 007-recursive-external-deps | **Date**: 2026-08-30

## The scenario

Project A depends on B (an `http_archive`) and loads B's bzl, which declares more dependencies:

```python
# A/WORKSPACE
http_archive(
    name = "B",
    urls = ["https://example.org/B-1.0.tar.gz"],
    sha256 = "bbb...",
    strip_prefix = "B-1.0",
)
load("@B//:setup.bzl", "setup_deps")
setup_deps()  # internally: http_archive(name = "openssl", ...) and load("@C//:more.bzl", ...)
```

Previously, `inspect` skipped the `@B//...` load — `openssl` (and anything B's chain declared) was invisible. Now it is discovered and rewritable.

## 1. Discover (sandbox present or not)

```bash
bazel-git-lfs init        # once
bazel-git-lfs inspect     # JSON snapshot
```

- If the project was built/fetched before, B's bzl is read from Bazel's working area.
- If not, B's archive is downloaded (only when it declares a sha256), extracted to a temporary location, scanned, and cleaned up.
- Output highlights: dependencies from B carry `"origin": "external-bzl"`, `"fromRepo": "B"`, and their load chain. Divergent duplicate declarations set `hasConflicts: true` and exit non-zero — resolve them before checkout.

## 2. Mirror as usual

```bash
bazel-git-lfs fetch && bazel-git-lfs push
```

The recursive dependencies are fetched/pushed like any others (they are ordinary snapshot entries now).

## 3. Switch sources

```bash
bazel-git-lfs checkout local      # or a profile alias
```

- Project-tree URLs are rewritten directly (Stage 5 behavior).
- Dependencies declared inside B are switched by patch injection: an audit patch is written to `.bazel_git_lfs/patches/B.patch` and a marker-tagged `patch_cmds` command is merged into B's `http_archive` declaration in the entry file, so Bazel applies the URL rewrite when it fetches B. Declared digests stay valid (mirrored artifacts are byte-identical).

## 4. Restore

```bash
bazel-git-lfs checkout default
```

Removes injected `patch_cmds` markers from entry files and deletes audit patches — exactly the inverse of step 3. The pre-commit hook keeps guarding commits as before.

## Things that degrade gracefully

| Situation | Behavior |
|-----------|----------|
| No sandbox and B has no declared sha256 | inspect warns; B's internal deps stay undiscovered |
| Two load chains declare C with different URLs | conflict error; inspect exits 1; checkout refuses C |
| B's entry declaration missing from the project tree | checkout warns; project-tree deps still process |
| Load cycle (A→B→A) | traversal terminates; cycle noted in warnings |
