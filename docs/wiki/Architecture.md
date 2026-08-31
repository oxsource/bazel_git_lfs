# Architecture

This page describes the internal architecture of `bazel-git-lfs`.

## Interception/Passthrough Pattern

`bazel-git-lfs` uses an interception/passthrough pattern. `.bazel_git_lfs/objects/` is an inner git repository managed via Git LFS. Only 4 commands are custom; all others pass through to `git -C .bazel_git_lfs/objects <args>`.

```
bazel-git-lfs <cmd> <args>
  ├── init      → Custom: .bazel_git_lfs/ → mkdir objects → git init + LFS
  ├── inspect   → Custom: scan Bazel files → write snapshot (cached)
  ├── clean     → Custom: remove entire .bazel_git_lfs/
  ├── checkout  → Hybrid: --/@ → custom URL replacement
  │                       <branch> → git checkout + custom patch
  └── *         → Passthrough: git -C .bazel_git_lfs/objects <cmd> <args>
```

## Directory Structure

```
.bazel_git_lfs/
├── .bazelconfig             # Project config (INI: server port, inspect filters)
├── dependencies.json        # Snapshot from inspect
├── checkout-state.json      # Non-default checkout state
└── objects/                 # Inner git repository (Git LFS managed)
    ├── .git/                # Git repo metadata
    ├── .gitattributes       # LFS track rules
    └── <dependency files>   # Archived artifacts tracked via LFS
```

## Init Flow

```
bazel-git-lfs init:
1. mkdir -p .bazel_git_lfs/
2. mkdir .bazel_git_lfs/objects/
3. cd .bazel_git_lfs/objects/ && git init
4. git lfs track "*"    (if git-lfs installed)
5. Add .bazel_git_lfs/ to .gitignore
6. Install pre-commit hook
```

## Inspect Flow

```
bazel-git-lfs inspect:
1. Check .bazel_git_lfs/dependencies.json exists
2. If cached and no -f: print cache directly
3. If missing or -f: scan Bazel files → write snapshot → output
```

## Passthrough Flow

Unrecognized commands are forwarded to:

```bash
git -C .bazel_git_lfs/objects <cmd> <args>
```

This includes `fetch`, `push`, `pull`, `remote`, `status`, `log`, `branch`, `add`, `commit`, and any other git command.

## Post-hooks

After successful `git -C .bazel_git_lfs/objects remote add <name> <url>`, the tool outputs a branch naming suggestion:

```
Suggested branch format: <group>_<repo>_<feature>
```

## Checkout Hybrid Flow

- `--` / `default` → Custom URL replacement logic (restore original source URLs)
- `@` / `local` → Custom URL replacement logic (switch to `file://` paths)
- `<branch>` → `git -C .bazel_git_lfs/objects checkout <branch>` first, then custom URL replacement/patch

## Pre-commit Hook

Installed by `init` at `.git/hooks/pre-commit`. Checks for `checkout-state.json`; if present, runs `bazel-git-lfs checkout default` to restore URLs before commit.

## Integrity Verification

SHA256 verification happens at every storage boundary:
- **Fetch**: Downloaded content verified before storage
- **Push**: Objects re-verified before upload
- **Pull**: Objects verified before entering local store