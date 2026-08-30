# Architecture

This page describes the internal architecture of `bazel-git-lfs` — the key components and how they interact.

## High-Level Overview

```
┌─────────────────────────────────────────────────┐
│                  CLI (Commander)                 │
│  init │ remote │ inspect │ fetch │ push │ pull  │
│  status │ clean │ checkout                       │
└──────┬──────────────────────────────────────┬────┘
       │                                      │
       ▼                                      ▼
┌──────────────┐                    ┌─────────────────┐
│  Config Layer │                    │  Mirror Layer    │
│  ───────────  │                    │  ──────────────  │
│  store.ts     │◄──────────────────►│  repository.ts   │
│  resolve.ts   │   profiles/urls    │  manifest.ts     │
│  scope.ts     │                    │  lfs.ts          │
│  paths.ts     │                    │  alias.ts        │
└──────────────┘                    └─────────────────┘
       │                                      │
       ▼                                      ▼
┌──────────────┐                    ┌─────────────────┐
│  Inspect     │                    │  Transfer Layer  │
│  ───────────  │                    │  ──────────────  │
│  loader.ts   │                    │  fetch.ts        │
│  parser.ts   │                    │  push.ts         │
│  snapshot.ts │                    │  pull.ts         │
└──────────────┘                    └─────────────────┘
       │
       ▼
┌──────────────┐
│  Objects     │
│  ───────────  │
│  store.ts    │
│  sha256.ts   │
│  download.ts │
└──────────────┘
```

## Objects Store

The objects store is a content-addressed cache at `.bazel_git_lfs/objects/`. Each object is stored at a path derived from its source URL and SHA256 digest:

```
.bazel_git_lfs/objects/
└── <reversed-host>/
    └── <org>/
        └── <repo>/
            └── <sha256>
```

Objects are stored atomically: content is written to a temporary file, verified against the declared SHA256, and only renamed to the final path on successful verification. Failed verifications leave no stale files.

## Mirror Manifest

The mirror manifest (`manifest.json`) lives in the mirror repository and tracks every object that has been pushed to the mirror:

```json
{
  "updatedAt": "2026-01-15T10:00:00.000Z",
  "objects": {
    "<sha256>": {
      "path": "com/example/lib/1.0.0/lib-1.0.0.tar.gz",
      "sources": [
        "https://repo1.maven.org/maven2/com/example/lib/1.0.0/lib-1.0.0.tar.gz"
      ]
    }
  }
}
```

Each entry maps a SHA256 digest to its physical path in the mirror's LFS store and the original source URL(s). The `sources` array accumulates URLs from all projects that push the same object, enabling the `checkout default` command to restore the correct original URL.

## Checkout State

When a non-default checkout is applied (e.g., `bazel-git-lfs checkout local`), the tool writes a state file at `.bazel_git_lfs/checkout-state.json`:

```json
{
  "alias": "local",
  "appliedAt": "2026-01-15T10:00:00.000Z"
}
```

This file is read by the pre-commit hook to determine whether auto-restore is needed before a commit.

## Pre-commit Hook

The pre-commit hook (installed by `init` at `.git/hooks/pre-commit`) checks for the existence of `checkout-state.json`. If present, it runs `bazel-git-lfs checkout default` to restore URLs to their original sources before the commit proceeds.

## Git LFS Integration

The tool delegates all Git LFS operations to the system `git-lfs` binary. It never reimplements LFS protocols. The mirror repository uses LFS to store the actual artifact content, while the manifest and metadata are stored as regular git-tracked files.

## Integrity Verification

SHA256 verification happens at every storage boundary:

- **Fetch**: Downloaded content is verified against the declared SHA256 before it enters the local objects store
- **Push**: Locally stored objects are re-verified before upload to the mirror
- **Pull**: Objects pulled from the mirror are verified before they enter the local objects store
- **Status**: The `status` command can re-verify all locally stored objects

Objects that fail verification are never stored — the tool deletes the invalid data and reports the mismatch.