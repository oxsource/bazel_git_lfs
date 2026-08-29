# Quickstart: Mirroring Core (fetch / pull / push)

Populate a shared Git LFS mirror from one project, then consume it everywhere else — without ever re-hitting the public internet.

## Prerequisites

- Node.js ≥ 18, `git`, `git-lfs` installed (`git lfs install` once per machine)
- A bare Git repository for the mirror (e.g., `git@gitlab.example.com:mirrors/bazel.git`), with credentials available to system git

## 1. Populate the mirror (first machine)

```bash
cd my-bazel-project
bazel-git-lfs init
bazel-git-lfs remote add --url https://gitlab.example.com/mirrors/bazel-artifacts.git
bazel-git-lfs remote set-default default
bazel-git-lfs inspect        # discovers deps, persists .bazel_git_lfs/dependencies.json
bazel-git-lfs fetch          # origin → .bazel_git_lfs/objects/ (SHA256-verified)
bazel-git-lfs push           # local objects → mirror + manifest.json, commit & push
```

After `push`, the mirror contains one LFS object per SHA256 and an up-to-date `manifest.json`:

```text
objects/com/github/facebook/react/ab12…   # Maven-style reversed-domain layout
manifest.json
```

## 2. Consume the mirror (second machine / CI)

```bash
cd my-bazel-project          # same project, fresh checkout
bazel-git-lfs init
bazel-git-lfs remote add --url https://gitlab.example.com/mirrors/bazel-artifacts.git
bazel-git-lfs remote set-default default
bazel-git-lfs inspect
bazel-git-lfs pull           # mirror → local store; origin never contacted
```

All objects arrive in `.bazel_git_lfs/objects/` and are SHA256-verified on arrival. If the mirror lacks an object (nobody pushed it yet), `pull` fails for that dependency with `not-in-mirror` and an actionable message — run `fetch` + `push` upstream first.

## Everyday flows

```bash
bazel-git-lfs fetch   # new deps added to WORKSPACE? get them from origin, verified
bazel-git-lfs push    # share them with the team (idempotent; no-op re-push creates no commit)
bazel-git-lfs pull    # fresh machine/CI: get everything from the mirror
```

## Behavior notes

- **Integrity first**: an artifact is stored (locally or in the mirror) only if its content matches the declared SHA256; dependencies without a SHA256 are rejected (`missing-sha256`).
- **Dedup**: identical content from different URLs is stored once; the manifest accumulates source URLs.
- **Layout**: `objects/<reversed-host>/<org>/<repo>/<sha256>` — e.g. `https://github.com/facebook/react/...` → `objects/com/github/facebook/react/<sha256>`.
- **Safe to interrupt**: objects are written atomically; a dirty mirror working clone under `.bazel_git_lfs/mirror/` self-heals (reset or re-clone).
- **JSON only**: all output is machine-readable JSON; failures exit non-zero.

## Quickstart validation (from spec SC-002/SC-003)

```bash
# after init + remote + inspect in a fixture project with 3 deps:
bazel-git-lfs fetch   # → 3× fetched; objects exist under expected reversed-domain paths
bazel-git-lfs push    # → 3× uploaded, mirror has objects + manifest.json, commit pushed
bazel-git-lfs push    # → 3× already-mirrored, pushed:false, no new commit
# in a fresh copy of the project (same snapshot, no local objects):
bazel-git-lfs pull    # → 3× pulled; local store byte-identical; zero origin requests
```
