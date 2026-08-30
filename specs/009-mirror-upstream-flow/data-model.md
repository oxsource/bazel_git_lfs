# Data Model: Mirror Upstream Flow

## Inner Git Repo

`.bazel_git_lfs/objects/` is a standard git repository with Git LFS enabled.

**Structure**:
```
.bazel_git_lfs/
├── config.json          # Project config (profiles, aliases) — created by init
├── dependencies.json    # Snapshot — created by inspect
├── objects/
│   ├── .git/            # Inner git repo metadata
│   ├── .gitattributes   # Git LFS track rules
│   └── ...              # Dependency files tracked via LFS
└── checkout-state.json  # Existing (if any)
```

**Init flow**: `.bazel_git_lfs/` → `mkdir objects` → `git init` in objects → `git lfs track`

## Interception Registry

```typescript
interface InterceptorEntry {
  command: string;       // e.g., "init", "inspect", "clean", "checkout"
  handler: (args: string[], options: Record<string, any>) => Promise<number>;
}

interface Interceptor {
  registry: Map<string, InterceptorEntry>;
  lookup(cmd: string): InterceptorEntry | null;
  passthrough(args: string[]): Promise<number>;  // git -C .bazel_git_lfs/objects <args>
}
```

**Registered commands**: `init`, `inspect`, `clean`, `checkout` (hybrid: `--`/`@` → custom only; other args → git passthrough + custom patch)
**Passthrough**: Everything else → `git -C .bazel_git_lfs/objects <args>`

## Pre/Post Hooks

```typescript
type PreHook = (args: string[], options: Record<string, any>) => Promise<PreHookResult>;
type PostHook = (exitCode: number, args: string[], options: Record<string, any>) => Promise<void>;

interface PreHookResult {
  proceed: boolean;    // false to halt before passthrough
  args?: string[];     // modified args to pass through
  message?: string;    // error message if not proceeding
}
```

**Pre-hooks** (before fetch/push/pull passthrough):
- Check upstream configured via `git -C .bazel_git_lfs/objects remote -v`
- Check reachable via `git -C .bazel_git_lfs/objects ls-remote`
- Prompt for `--remote` and `--branch` if not configured

**Post-hooks** (after remote add passthrough):
- Parse URL for branch naming convention
- Prompt: "Bind upstream? Suggested branch format: group_repo_<feature>"

## Upstream Health Check

```
Check flow:
1. git -C .bazel_git_lfs/objects remote get-url origin
   → if fails: "No remote configured" → prompt set-upstream
2. git -C .bazel_git_lfs/objects ls-remote origin HEAD
   → if fails: unreachable → "Remote unreachable"
   → if succeeds: proceed with passthrough
```

## Branch Suggestion

```typescript
interface BranchSuggestion {
  prefix: string;      // e.g., "oxsource_bazel-git-lfs"
  format: string;      // e.g., "oxsource_bazel-git-lfs_<feature>"
}
```

**Parsing**: Extract group/repo from SSH, HTTPS, or Git URL format.

## State Transitions

```
init → .bazel_git_lfs/ created + objects/ git init
  → inspect → scan Bazel files → dependencies.json
  → remote add (passthrough) → git remote in objects/.git
     → post-hook: branch suggestion prompt
  → fetch/push/pull (passthrough) → git operations on objects/
     → pre-hook: upstream health check
  → checkout (custom hybrid) → `--`/`@` → direct URL replacement
     → `<branch>` → git checkout + URL replacement/patch
  → clean → remove entire .bazel_git_lfs/
```