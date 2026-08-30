# CLI Contracts: Command Reference

**Date**: 2026-08-30 | **Phase**: 1 (Design)

This document defines the canonical CLI command contracts for the Wiki command reference pages. Each contract maps to one Wiki page under `Commands/`.

## Contract: `init`

```
bazel-git-lfs init
```

Creates the `.bazel_git_lfs/` config directory and updates `.gitignore`.

**JSON output**:
```json
{ "ok": true, "configPath": "<path>", "message": "Initialized config area at <path>" }
```

**Exit codes**:
- 0: Success
- 1: Config directory creation failed

## Contract: `remote add`

```
bazel-git-lfs remote add [--global] [--alias <name>] [--url <url>] [--json]
```

Add or update a mirror profile.

**JSON output**:
```json
{ "ok": true, "alias": "default", "scope": "local", "configPath": "<path>", "active": "default", "message": "..." }
```

**Exit codes**: 0 ok, 1 error, 2 usage error

## Contract: `remote set-default`

```
bazel-git-lfs remote set-default [--global] <alias>
```

Set the active profile.

## Contract: `remote remove`

```
bazel-git-lfs remote remove [--global] <alias>
```

Remove a profile.

## Contract: `remote list`

```
bazel-git-lfs remote list [--global] [--effective] [--json]
```

List profiles. `--effective` shows the resolved active profile.

## Contract: `remote alias add`

```
bazel-git-lfs remote alias add <name> <url>
```

Add a global URL alias.

## Contract: `remote alias list`

```
bazel-git-lfs remote alias list [--json]
```

List global URL aliases.

## Contract: `remote alias remove`

```
bazel-git-lfs remote alias remove <name>
```

Remove a global URL alias.

## Contract: `inspect`

```
bazel-git-lfs inspect [--json]
```

Scan Bazel project files for HTTP dependencies.

**JSON output**:
```json
{ "ok": true, "dependencies": [...], "filesScanned": [...], "warnings": [...] }
```

## Contract: `fetch`

```
bazel-git-lfs fetch [--json]
```

Download all dependencies from their origin URLs.

**JSON output**:
```json
{ "ok": true, "command": "fetch", "projectDir": "...", "objectsDir": "...", "results": [...], "warnings": [...], "summary": { "total": 2, "fetched": 2, "cached": 0, "failed": 0 } }
```

## Contract: `push`

```
bazel-git-lfs push [--json]
```

Upload locally cached objects to the mirror repository.

## Contract: `pull`

```
bazel-git-lfs pull [--json]
```

Download objects from the mirror repository into the local objects store.

## Contract: `status`

```
bazel-git-lfs status [<sha256-prefix>] [--json]
```

Show mirror status, optionally filtered by SHA256 prefix.

## Contract: `clean`

```
bazel-git-lfs clean [--json]
```

Remove local objects store, mirror working clone, and snapshot.

**JSON output**:
```json
{ "ok": true, "command": "clean", "removed": { "objects": true, "mirror": true, "snapshot": true } }
```

## Contract: `checkout`

```
bazel-git-lfs checkout <alias>
```

Rewrite dependency URLs in Bazel files to the target source.

**Aliases**:
- `default` or `--`: Restore to original source URLs
- `local` or `@`: Switch to local file:// paths
- `<profile-name>`: Switch to that profile's remote URL