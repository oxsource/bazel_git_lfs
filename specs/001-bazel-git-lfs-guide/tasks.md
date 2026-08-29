# Tasks: Bazel Dependency Mirror Tool

**Input**: Design documents from `/specs/001-bazel-git-lfs-guide/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md)

**Tests**: No explicit test tasks requested; each stage defines an exit signal in plan.md.

**Organization**: Tasks are grouped by the **6 delivery stages** defined in [plan.md](./plan.md). Each stage maps to a dedicated design planning guide (设计规划指导). A task is checked off only when its corresponding design planning guide is analyzed, planned, and delivered.

## Format: `[ID] [Stage] Description`

- **[Stage]**: Which delivery stage this task belongs to (S1–S6, matching plan.md)
- Include the linked design planning guide for each task

## Stage → Design Planning Guide Link Table

| Task | Stage | Design Planning Guide (设计规划指导) |
|------|-------|-------------------------------------|
| T001 | S1 Foundation & Config | `#<design-planning-guide-link>` (待创建) |
| T002 | S2 Discovery (`inspect`) | [plan.md](../003-discovery-inspect/plan.md) (设计规划指导) |
| T003 | S3 Mirroring Core (`sync`) | `#<design-planning-guide-link>` (待创建) |
| T004 | S4 Mirror Consumption (`verify`/`list`/`search`) | `#<design-planning-guide-link>` (待创建) |
| T005 | S5 Business Project Rewrite (`rewrite`) | `#<design-planning-guide-link>` (待创建) |
| T006 | S6 Packaging & Release | `#<design-planning-guide-link>` (待创建) |

---

## Stage 1: Foundation & Config (S1)

**Goal**: TypeScript/Node.js scaffold, CLI skeleton, `init` wizard + namespace-tagged profile management (see plan.md Stage 1).

**Exit signal**: `bazel-git-lfs init` creates/updates a profile; commands resolve the active config.

- [ ] T001 [S1] Complete Foundation & Config stage per [plan.md](./plan.md) Stage 1 → 设计规划指导: `#<design-planning-guide-link>` (待创建)

---

## Stage 2: Discovery (S2)

**Goal**: Read-only `inspect` of Bazel projects extracting remote HTTP dependencies, with a cache command persisting results for fast `list` reads (see plan.md Stage 2).

**Exit signal**: `inspect` returns the exact expected dependency set for fixture projects without side effects; the cache persists the result.

- [x] T002 [S2] Complete Discovery stage per [plan.md](./plan.md) Stage 2 → 设计规划指导: [003-discovery-inspect/plan.md](../003-discovery-inspect/plan.md)

---

## Stage 3: Mirroring Core (S3)

**Goal**: `sync` — download, SHA256 verify, content-addressed cache, Git LFS upload, manifest, commit/push (see plan.md Stage 3).

**Exit signal**: First-time sync populates the mirror; re-sync is idempotent; hash mismatch rejected.

- [ ] T003 [S3] Complete Mirroring Core stage per [plan.md](./plan.md) Stage 3 → 设计规划指导: `#<design-planning-guide-link>` (待创建)

---

## Stage 4: Mirror Consumption (S4)

**Goal**: `verify`, `list`, `search` — query and audit the mirror (see plan.md Stage 4).

**Exit signal**: Tampered artifact reported corrupt; inventory queries return correct artifacts.

- [ ] T004 [S4] Complete Mirror Consumption stage per [plan.md](./plan.md) Stage 4 → 设计规划指导: `#<design-planning-guide-link>` (待创建)

---

## Stage 5: Business Project Rewrite (S5)

**Goal**: `rewrite` — point business Bazel projects at mirror URLs, dry-run by default (see plan.md Stage 5).

**Exit signal**: Dry-run previews changes without writing; write mode updates only target URLs.

- [ ] T005 [S5] Complete Business Project Rewrite stage per [plan.md](./plan.md) Stage 5 → 设计规划指导: `#<design-planning-guide-link>` (待创建)

---

## Stage 6: Packaging & Release (S6)

**Goal**: npm package with `bazel-git-lfs` binary, published to public npm, documented release process (see plan.md Stage 6).

**Exit signal**: `npm install -g bazel-git-lfs` makes the CLI invocable; releases are repeatable.

- [ ] T006 [S6] Complete Packaging & Release stage per [plan.md](./plan.md) Stage 6 → 设计规划指导: `#<design-planning-guide-link>` (待创建)

---

## Dependencies & Execution Order

- **Sequential by design**: Stages S1 → S6 are delivered in order. Each stage's design planning guide is analyzed, planned, and implemented independently; a stage's task here is checked off when that design planning guide is complete.
- **S1** must complete before any later stage can run against real config.
- **S2** precedes **S3** (sync needs discovery).
- **S3** precedes **S4** and **S5** (verify/list/search/rewrite consume the mirrored manifest).
- **S6** is final (packaging assumes the CLI is functional).

## Notes

- This task list intentionally stays at stage granularity. Detailed task breakdown for each stage lives in that stage's own design planning guide (设计规划指导), created separately (参照 plan.md 的 Notes on Downstream Analysis).
- When a stage's design planning guide is delivered, update this file: replace `#<design-planning-guide-link>` with the actual link and mark the checkbox `[x]`.
