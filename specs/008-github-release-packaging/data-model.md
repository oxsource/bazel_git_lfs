# Data Model: GitHub Wiki Pages

**Date**: 2026-08-30 | **Phase**: 1 (Design)

## Wiki Page Entity

| Field | Description |
|---|---|
| File name | Wiki page filename (e.g., `Home.md`, `Installation.md`) |
| Title | Page heading (H1) |
| FR mapping | Which functional requirement(s) this page addresses |
| Parent | Related parent page (`Home` is the root) |
| Audience | Target reader (new user, power user, CI operator) |

## Page Inventory

| Page | FR | Audience | Content |
|---|---|---|---|
| `Home.md` | FR-008 | All | Overview, quick links to all sections, navigation sidebar structure |
| `Installation.md` | FR-001 | New user | System requirements, npm install, npx usage, verify installation |
| `Quickstart.md` | FR-002 | New user | Step-by-step tutorial with concrete example |
| `Commands.md` | FR-003 | All users | Master command index with links to sub-pages |
| `Commands/init.md` | FR-003 | New user | `init` command — purpose, syntax, options |
| `Commands/remote.md` | FR-003 | All users | `remote` command — add, list, set-default, remove, alias |
| `Commands/inspect.md` | FR-003 | All users | `inspect` command — dependency discovery |
| `Commands/fetch.md` | FR-003 | All users | `fetch` command — download dependencies |
| `Commands/push.md` | FR-003 | All users | `push` command — upload to mirror |
| `Commands/pull.md` | FR-003 | All users | `pull` command — download from mirror |
| `Commands/status.md` | FR-003 | All users | `status` command — check mirror state |
| `Commands/clean.md` | FR-003 | All users | `clean` command — reset local state |
| `Commands/checkout.md` | FR-003 | Advanced | `checkout` command — switch URL sources |
| `Configuration.md` | FR-004 | Power user | Config file, profiles, scopes, aliases, env vars |
| `Architecture.md` | FR-005 | Power user | Objects store, mirror manifest, checkout state, pre-commit hook |
| `Troubleshooting.md` | FR-006 | All users | Common errors, causes, solutions |
| `CI-CD.md` | FR-007 | DevOps | CI installation, command sequence, JSON output, exit codes |

## Page Structure Template

Each command page follows this template:

```markdown
# Command: <name>

## Purpose
[One-paragraph description of what the command does and when to use it.]

## Usage
```
<command> [options] [arguments]
```

## Options
| Option | Description |
|--------|-------------|
| `--flag` | Description |

## Examples
[2-3 examples with input and expected output.]

## JSON Output
[Description of JSON output format when `--json` is used.]

## Exit Codes
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error |
| 2 | Usage error |
```