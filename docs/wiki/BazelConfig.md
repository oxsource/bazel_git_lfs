# BazelConfig (.bazelconfig)

`.bazel_git_lfs/.bazelconfig` is a lightweight, **INI-style** configuration file
that lets you override behavior that is otherwise hard-coded in `bazel-git-lfs`.

It is **project-local** — there is no global scope. If the file (or a key) is
absent, `bazel-git-lfs` falls back to sensible defaults.

---

## File Location

```
.bazel_git_lfs/.bazelconfig
```

The file lives inside `.bazel_git_lfs/` so it is managed per project. During
`bazel-git-lfs init`, the external repository's `.gitignore` is updated to
**track `.bazelconfig` in version control** while still ignoring everything else
under `.bazel_git_lfs/`:

```gitignore
.bazel_git_lfs/*
!.bazel_git_lfs/.bazelconfig
```

This means `.bazelconfig` is committed alongside your source, so every
contributor gets the same per-project behavior.

---

## Supported Keys

| Key | Default | Description |
|-----|---------|-------------|
| `server.port` | `8022` | Port used by the local object HTTP server (started by `checkout @`). |
| `inspect.exclude` | *(none)* | Dependency names (exact match) to **exclude** from archiving during `inspect`. |
| `inspect.append` | *(none)* | Manually-added dependencies that the scan **missed**, one entry per value. |

---

## Syntax

The format mirrors `git config`:

- `[section]` blocks and `key = value` assignments.
- `#` / `;` start a line comment; inline `#` after a value is a comment.
- Keys are case-insensitive and flattened to `section.key` (e.g. `server.port`).
- Arrays support **two styles**, which can be combined:

  | Style | Example | Meaning |
  |-------|---------|---------|
  | Array literal | `exclude = [a, b]` | Set multiple values at once |
  | Append | `exclude += c` | Add one more value |

  - `+=` accumulates within the **same section**; a different section does not
    accumulate.
  - An `=` assignment **resets** prior `=`/`+=` values for that key.
  - Elements can be quoted to preserve commas: `append = ["a,b", c]`.

---

## Empty Template

Copy the following into `.bazel_git_lfs/.bazelconfig` and fill in only the
values you need. Unused sections can be left out entirely — every key has a
default.

```ini
# .bazel_git_lfs/.bazelconfig
# bazel-git-lfs project config (INI format)

[server]
# Local object HTTP server port (default: 8022).
# port = 8022

[inspect]
# Dependencies to EXCLUDE from archiving (exact name match).
# exclude = some_dep
# exclude += another_dep

# Dependencies the scan MISSED — add them manually.
# Format: name|urls(comma-separated)|sha256[|stripPrefix]
# append = manual_dep|https://example.org/m.tar.gz|<sha256>
# append += other_dep|https://example.org/o.tar.gz|<sha256>|third_party
```

---

## Example

```ini
# .bazel_git_lfs/.bazelconfig

[server]
# Change the local object server port.
port = 9022

[inspect]
# Don't archive these scanned dependencies (exact name match).
exclude = some_unwanted_dep
exclude += another_dep
# Array literal and += can be mixed:
exclude = [third_dep]

# Manually add dependencies the scan missed.
# Format: name|urls(comma-separated)|sha256[|stripPrefix]
append = manual_dep|https://example.org/m.tar.gz|a1b2c3d4...e5f6
append += other_dep|https://example.org/o.tar.gz|f6e5...d4c3|third_party
```

---

## Behavior

- **`server.port`**
  - Defaults to `8022`.
  - Used by the local HTTP server, `checkout` base-URL rewriting, and the
    "is this our local server?" check (`isLocalFallbackUrl`).
  - A non-numeric or out-of-range value is ignored and the default is used.

- **`inspect.exclude`**
  - Applied to the inspect result **before** the snapshot is written.
  - Matched by dependency `name` (exact match).
  - Excluded dependencies are neither archived by `inspect -u` nor appear in
    the effective snapshot.

- **`inspect.append`**
  - Adds dependencies the scanner missed.
  - Each entry follows the dependency model used by inspect:
    `name|urls(comma-separated)|sha256[|stripPrefix]`.
  - Applied **before** the snapshot is written, so `inspect -u` will archive and
    commit them alongside scanned dependencies.
  - Malformed rows are ignored.

---

## Interaction with `inspect`

Run `bazel-git-lfs inspect` after editing `.bazelconfig`. The config overrides
are applied to the scan result and persisted to the snapshot
(`.bazel_git_lfs/dependencies.json`):

```bash
bazel-git-lfs inspect          # apply .bazelconfig and show effective result
bazel-git-lfs inspect -u       # archive appends and skips excludes
```

See [Commands-inspect](Commands-inspect) for the full `inspect` reference.

---

## Relation to Other Config

| File | Purpose | Versioned |
|------|---------|-----------|
| `.bazel_git_lfs/.bazelconfig` | Behavior overrides (port, inspect filters) | ✅ (tracked via `!.bazel_git_lfs/.bazelconfig`) |
| `.bazel_git_lfs/dependencies.json` | Inspect snapshot | ❌ (regenerated) |
| `.bazel_git_lfs/objects/` | Inner Git LFS repo of object files | ❌ (ignored) |
