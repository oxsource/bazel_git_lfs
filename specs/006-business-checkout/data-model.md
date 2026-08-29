# Data Model: Business Project Checkout

Entities from the feature spec. All data types are read from existing Stage 3/4 entities (MirrorManifest, ManifestEntry) and config profiles; no new storage entities are introduced beyond the checkout state marker.

## Entity: CheckoutResult

The top-level `checkout` command output.

- `command` (string) — `"checkout"`.
- `alias` (string) — the alias used (`default`, `local`, or a profile name).
- `target` (string) — the resolved target URL type (`"original"`, `"local"`, or `"remote"`).
- `changes` (CheckoutChange[]) — per-dependency URL changes applied.
- `changed` (number) — count of dependencies whose URLs were changed.
- `unchanged` (number) — count of dependencies already at the target URL.

## Entity: CheckoutChange

A single URL change applied to a dependency.

- `file` (string) — the Bazel file path (relative to project root).
- `dependency` (string) — the dependency name.
- `before` (string) — the URL before the change.
- `after` (string) — the URL after the change.

## Entity: CheckoutState

Marker indicating that a non-default checkout has been applied.

- `alias` (string) — the alias used (`local` or a profile name).
- `appliedAt` (string) — ISO-8601 timestamp of when checkout was applied.

Stored as a JSON file at `.bazel_git_lfs/checkout-state.json`. Created by `checkout <alias>` (non-default) and removed by `checkout default`.

## Entity: ReservedAliases

Shared constants module defining built-in aliases.

- `DEFAULT` (string) — `"default"`, with shorthand `"--"`.
- `LOCAL` (string) — `"local"`, with shorthand `"@"`.

Defined in `src/mirror/alias.ts`. Consumed by `checkout` and `remote add` commands.

## Relationships

- A **CheckoutResult** contains zero or more **CheckoutChange** entries.
- **CheckoutState** is written by `checkout` (non-default) and read by the pre-commit hook.
- **ReservedAliases** is a constant module — no instances, no persistence.