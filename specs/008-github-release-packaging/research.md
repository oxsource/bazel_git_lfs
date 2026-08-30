# Research: GitHub Release Packaging

**Date**: 2026-08-30 | **Phase**: 0 (Discovery)

## Research Questions

### 1. How should GitHub Wiki pages be organized for a CLI tool?

**Decision**: Use a flat page structure with cross-references, organized by user workflow.

**Rationale**: GitHub Wiki does not support nested folders natively. Pages are listed in the sidebar alphabetically. Using a flat structure with clear page naming (e.g., `Commands-init`, `Commands-fetch`, `Commands-push`) groups related pages in the sidebar via alphabetical adjacency. Cross-references between pages link users to related topics.

**Alternatives considered**:
- Subdirectory-style naming (`Commands/Init`) — GitHub Wiki treats `/` as part of the filename, not a directory.
- Single monolithic page — too long for users to navigate.

### 2. What Markdown features does GitHub Wiki support?

**Decision**: Use standard GitHub-Flavored Markdown (GFM) plus Wiki-specific features.

**Rationale**: GitHub Wiki supports GFM including:
- Code blocks with syntax highlighting
- Tables
- Task lists
- Links between Wiki pages (`[Installation](Installation)`)
- Links to repository files (`[source](../../src/cli/checkout.ts)`)
- Embedding images
- Mermaid diagrams (for architecture page)

**Alternatives considered**: None — GFM is the standard.

### 3. How should CLI command syntax be documented?

**Decision**: Use the standard `usage: <command> [options] <args>` format with option tables.

**Rationale**: This is the POSIX/Unix convention that CLI users expect. It matches the `--help` output of the tool itself, ensuring consistency between the documentation and the actual CLI.

**Alternatives considered**: Man-page style, info-page style — more verbose and harder to maintain.

### 4. How to verify documentation accuracy against the CLI?

**Decision**: Manual verification against the built CLI. Each command page is reviewed by running `bazel-git-lfs <command> --help` and comparing the output.

**Rationale**: The CLI is the source of truth. Automated testing of Wiki content is not practical (Wiki is outside the repository). Manual review is sufficient for the scope of this feature.

**Alternatives considered**: Automated Wiki content tests — impractical because Wiki is a separate Git repository.

### 5. What is the best approach for the quickstart tutorial?

**Decision**: Use a concrete example (mirroring the `react` and `beta` test fixtures from the project's own test suite).

**Rationale**: Users learn best by following along with a real example. Using the test fixtures ensures the example is known to work correctly. The quickstart mirrors the workflow in `tests/integration/quickstart.test.ts`.

**Alternatives considered**: Abstract placeholder examples — less useful for users who need concrete steps.