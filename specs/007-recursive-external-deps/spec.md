# Feature Specification: Stage 6 — Recursive External Dependency Discovery & Checkout

**Feature Branch**: `007-recursive-external-deps`

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description: "按上述讨论提案 — 依赖项目 B 并 load B 的 bzl 文件递归声明依赖时，inspect 需读取 Bazel 沙箱中对应 load 的 bzl 文件（无沙箱时下载解压兜底），checkout 需通过 patch 方式替换依赖；递归采用深度优先 + 首遇归属；同名依赖不一致声明冲突即阻断"

**Parent Guide**: [001-bazel-git-lfs-guide](../001-bazel-git-lfs-guide/) — this stage extends [Stage 3 (Discovery/Inspect)](../003-discovery-inspect/spec.md) and [Stage 5 (Business Project Checkout)](../006-business-checkout/spec.md).

## Clarifications

### Session 2026-08-30

- Q: checkout 对外部 bzl 中声明的依赖采用哪种替换落地方式？→ A: patch 注入 — 生成补丁文件并通过入口文件声明上的 patches 属性生效，不直接改写沙箱。
- Q: Bazel 沙箱不存在（未 fetch 过）时，inspect 是否支持下载依赖归档解压后扫描？→ A: 支持 — 下载解压到临时目录解析后清理，inspect 在无沙箱时也能完整发现递归依赖。
- Q: 同名外部仓库被不同 load 链以不同 urls/sha256 重复声明时？→ A: 冲突即阻断 — inspect 报告冲突并以非零退出，checkout 拒绝为冲突仓库生成补丁并整体失败，强制人工介入。
- Q: 递归遍历顺序？→ A: 深度优先（DFS）— 遇到 load 立即下钻闭合一条链再回溯兄弟分支，配合首遇归属减少重复依赖冲突。

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Discover dependencies declared inside a loaded external repository (Priority: P1)

A user's project depends on project B (declared via an archive rule such as `http_archive`) and loads B's `.bzl` file with a load statement like `load("@B//:deps.bzl", "setup")`. B's `deps.bzl` itself declares further remote dependencies (e.g., more archives) — possibly through several layers of loads, including loads that reference repositories declared by earlier layers. The user runs `bazel-git-lfs inspect` and the discovery now reaches **through** those external loads: every dependency declared inside B's bzl files appears in the snapshot with the same detail (name, URLs, sha256, strip prefix) as dependencies declared in the project's own files, plus provenance showing which external repository and load chain it came from.

When Bazel's working area already contains the external repository (the project has been built or fetched at least once), discovery reads the loaded bzl files directly from there. When it does not, discovery falls back to downloading the defining archive from its declared source URLs, extracting it temporarily, scanning the bzl files inside, and cleaning up afterwards. Either way, inspect remains read-only with respect to the project and still persists only the dependency snapshot.

**Why this priority**: Without this, any project using the common "macro-driven dependency" pattern has a blind spot — entire dependency trees are invisible to inspect and therefore to fetch/mirror. Everything else in this feature builds on it.

**Independent Test**: Point inspect at a fixture project that loads a pre-extracted external repository declaring a nested dependency; assert the nested dependency appears with provenance. Repeat with no sandbox present (simulated by an empty working area) and a local file:// fixture URL for the fallback; assert the same dependency is found via download-and-extract.

**Acceptance Scenarios**:

1. **Given** a project whose working area already contains external repository B with a bzl declaring dependency X, **When** inspect runs, **Then** X is discovered and attributed to repository B with its load chain recorded.
2. **Given** the same project with an empty working area and reachable source URLs for B, **When** inspect runs, **Then** B's archive is downloaded and extracted to a temporary location, X is discovered identically, and the temporary location is removed afterwards.
3. **Given** B's bzl loads another repository C's bzl which declares dependency Y, **When** inspect runs, **Then** Y is discovered and its provenance chain includes both B and C.
4. **Given** B's bzl cannot be located (no sandbox, download fails or is refused), **When** inspect runs, **Then** the run completes with a warning naming the unresolvable load; other dependencies are still discovered.
5. **Given** a project with no external-repository loads, **When** inspect runs, **Then** results are identical to the previous behavior (no regressions, no new warnings).

---

### User Story 2 — Depth-first traversal with first-encounter ownership and conflict blocking (Priority: P2)

When the same external repository (say C) is reachable from multiple load chains, discovery resolves it exactly once — the first time it is encountered in depth-first order — and later encounters simply reference the already-resolved result instead of creating duplicate records. When a repeat encounter declares **identical** content (same URLs, digest, strip prefix), this is treated as normal deduplication. When a repeat encounter declares **different** content (different URLs or digest), this is a conflict: inspect reports the conflict as an error-level result — naming both declaration sites, what differs, and which declaration was adopted — writes the snapshot marked as containing conflicts, and exits non-zero. Checkout refuses to proceed for any conflicted repository.

**Why this priority**: Correctness guard for the recursive discovery in US1. Deep projects frequently re-declare the same dependency in several bzl files; silent divergence between declarations would produce wrong patches downstream. Blocking forces a human decision rather than a silent arbitrary choice.

**Independent Test**: Fixture with two load chains loading the same repository with identical declarations → single dependency record with both provenance entries, no error. Same fixture with divergent URLs → inspect exits non-zero with a conflict report; checkout targeting that repository fails with an actionable message.

**Acceptance Scenarios**:

1. **Given** repository C declared identically from two different load chains, **When** inspect runs, **Then** exactly one record for C's dependencies exists, annotated with both chains, and exit code is 0.
2. **Given** repository C declared with different URLs from two load chains, **When** inspect runs, **Then** the snapshot is written flagged as conflicted, the output identifies both declaration sites and their difference, and the exit code is non-zero.
3. **Given** a conflicted repository, **When** the user runs checkout, **Then** checkout fails with a message directing the user to resolve the inspect-reported conflict, and no patch is produced for that repository.
4. **Given** a load structure that loops (repository A's bzl loads B's, which loads A's), **When** inspect runs, **Then** the traversal terminates with no duplicate explosion and notes the cycle.

---

### User Story 3 — Checkout applies external dependencies via patch injection (Priority: P3)

After inspect has discovered dependencies that live inside an external repository's bzl files, the user runs `bazel-git-lfs checkout <alias>`. For those dependencies, checkout cannot rewrite a file in the project tree (there is none — the declaration lives inside B). Instead, checkout generates a minimal patch that only rewrites the URL lines of B's internal declarations to the target source (default: original URLs; local: local object paths; profile: that remote's URL), stores it in the project's private configuration area, and injects a reference to that patch into B's own declaration in the entry file, so that when Bazel fetches B, the patch rewrites B's internal dependency declarations to the chosen source. Because the mirror stores dependencies byte-for-byte as published, only URLs change — declared digests remain valid.

The injection is idempotent: re-running checkout with the same alias updates the patch content in place rather than stacking injections. Running `checkout default` removes the injected attributes and deletes the generated patches. The existing pre-commit auto-restore behavior continues to cover the injected entry-file change.

**Why this priority**: Delivers the mirror-consumption value for the recursive scenario. It depends on US1's provenance, and follows the established checkout model (direct write + pre-commit safety net).

**Independent Test**: Fixture project whose entry file declares B via an archive rule and loads B's bzl (from a pre-extracted sandbox fixture) declaring dependency X. Run checkout with a local alias; assert a patch file is created containing only URL rewrites for X, the entry declaration gains exactly one patch reference, re-running is idempotent, and `checkout default` removes both.

**Acceptance Scenarios**:

1. **Given** inspected external dependencies and a target alias, **When** checkout runs, **Then** a patch per affected external repository is written under the configuration area, containing only URL-line replacements, and the entry declaration of that repository references the patch.
2. **Given** checkout has already been applied for an alias, **When** checkout runs again with the same alias, **Then** the patch is regenerated/updated in place — no duplicate patch references, no attribute stacking (idempotent).
3. **Given** a non-default checkout applied, **When** the user runs `checkout default`, **Then** injected patch references are removed from the entry file and generated patch files are deleted.
4. **Given** a project using a module-based setup where patch injection into the entry declaration is not possible, **When** checkout runs, **Then** the external dependencies are skipped with a clear warning and any project-tree dependencies still process normally.
5. **Given** a conflicted repository (US2), **When** checkout runs, **Then** checkout aborts with the conflict report rather than generating a patch from an arbitrary declaration.

---

### Edge Cases

- What happens when the sandbox working area exists but the specific repository directory is missing? (treat as "sandbox miss" → download fallback; if that fails, warning + skip)
- What happens when the external repository directory layout does not match the expected naming (different naming schemes across Bazel generations)? (fuzzy/suffix matching against the requested repository name; unresolved → warning)
- What happens when the loaded bzl path inside the repository does not exist? (warning naming the repository and path; scanning continues)
- What happens when the defining dependency for a fallback download has no declared sha256 or unreachable URLs? (skip with warning — never download unverified content; G1)
- What happens when the temporary extraction fails (corrupt archive)? (warning + skip; nothing is persisted)
- What happens when two *different* external repositories declare dependencies with the same dependency name? (allowed — records are keyed with provenance; patch generation scopes per repository so no cross-contamination)
- What happens when the entry declaration of an external repository cannot be found in the project tree (e.g., B is itself introduced by another layer)? (patch injection impossible → warning; that repository's external dependencies are reported but not rewritable in this stage)
- What happens when the snapshot on disk predates this feature (missing new fields)? (read with defaults; next inspect refreshes it)
- What happens when checkout is run while no inspect snapshot exists? (existing behavior preserved for project-tree dependencies; external-declaration handling requires a fresh inspect — reported as a warning)
- Does depth-first order affect the result? (yes, by design: shallowest/first-encountered declaration is authoritative for deduplication and patch generation)

## Requirements *(mandatory)*

### Functional Requirements

**Recursive discovery (extends inspect)**

- **FR-001**: Inspect MUST resolve load statements that reference external repositories (form `@repo//pkg/path:file.bzl`) instead of skipping them.
- **FR-002**: To read a loaded external bzl file, inspect MUST locate the repository's extracted content in Bazel's working area when present, using the repository name with tolerant matching for naming variants across Bazel generations.
- **FR-003**: When the working area lacks the repository, inspect MUST fall back to downloading the defining dependency's archive from its declared source URLs, extracting it to a temporary location, scanning the bzl files inside, and deleting the temporary location afterwards. Download fallback MUST be refused when the defining dependency has no declared sha256 or no reachable URL (G1: never accept unverified content).
- **FR-004**: Discovery MUST recurse depth-first: upon encountering a load, resolve and fully close that chain before continuing with sibling loads; each external repository's content is resolved at most once per run and reused.
- **FR-005**: Each dependency discovered through an external bzl MUST record provenance: the declaring external repository and the full load chain that led to it, and MUST be distinguishable from dependencies declared in the project tree.
- **FR-006**: Repeated discovery of the same external repository with identical declaration content (URLs, digest, strip prefix) MUST be deduplicated into one record annotated with all provenance paths (first-encounter ownership in DFS order).
- **FR-007**: Repeated discovery with divergent declaration content MUST be reported as a conflict error: the snapshot is written and flagged, the output identifies both declaration sites and the difference, and the inspect exit code MUST be non-zero.
- **FR-008**: Discovery MUST be protected against load cycles and pathological nesting via visited-set bookkeeping and a bounded traversal depth; reaching the bound produces a warning, not a crash.
- **FR-009**: Unresolvable external loads (no sandbox match, download refused/failed, path missing) MUST produce warnings naming the repository and path; the rest of discovery MUST continue.
- **FR-010**: The persisted snapshot schema MUST carry the new provenance/conflict information and MUST remain readable when older snapshots lack the new fields.

**Checkout via patch injection (extends checkout)**

- **FR-011**: For dependencies declared inside external repositories, checkout MUST NOT modify sandbox content directly; it MUST generate a patch file containing only URL-line replacements for that repository's internal declarations, stored in the project's private configuration area.
- **FR-012**: Checkout MUST make the patch effective by injecting a reference to it into the external repository's own declaration in the project tree (adding/merging a patches attribute on the declaring archive rule); the injection MUST be idempotent — re-running with the same alias updates the patch in place without stacking references.
- **FR-013**: Because mirrored artifacts are byte-identical to their sources, patches MUST change URLs only and MUST NOT alter declared digests.
- **FR-014**: `checkout default` MUST remove injected patch references from entry files and delete generated patch files; checkout state MUST record what was injected (files, patch list, prior content) so restore is exact.
- **FR-015**: Checkout MUST refuse to generate a patch for a repository whose declarations are conflicted (FR-007) and MUST fail the run with an actionable message.
- **FR-016**: For setups where patch injection into the entry declaration is impossible (e.g., the dependency is introduced via module rules rather than an entry-file archive declaration), checkout MUST skip those external dependencies with a clear warning and continue processing project-tree dependencies normally.
- **FR-017**: The existing pre-commit auto-restore behavior MUST continue to cover injected entry-file changes without modification to its mechanism.

**Constraints carried forward**

- **FR-018**: All inspect enhancements remain read-only for the business project and require init (FR-011 of Stage 3). Temporary extraction areas MUST live outside the project's versioned tree and be removed after use.
- **FR-019**: No new third-party dependencies (G5); repository backend abstraction (G4) and content-addressed storage (G3) are reused, not modified.

### Key Entities *(include if feature involves data)*

- **Dependency** (extended): adds origin (project tree vs external bzl), the declaring external repository, and the load chain; existing fields (name, urls, sha256, strip prefix, source file) unchanged.
- **External Repository Resolution**: per-run record of how a repository's content was obtained (sandbox hit, downloaded fallback, or unresolvable), so the same repository is only resolved once.
- **Dependency Conflict**: two or more divergent declarations for the same repository name — sites, differing fields, adopted declaration (for reporting only; conflicts block downstream).
- **Patch Record**: generated patch for one external repository — affected dependency URLs before/after, patch file location, and the injected reference in the entry file.
- **Checkout State** (extended): in addition to the current alias/applied-at, the list of injected entry files and patch files enabling exact restore.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a fixture project using the macro-driven dependency pattern, inspect discovers 100% of dependencies declared inside loaded external repositories that are present in the sandbox — verified by comparing against a known enumeration.
- **SC-002**: With no sandbox present but reachable source URLs, inspect still discovers the same set via temporary download-and-extract, completing within the existing inspect performance envelope (adds at most one download per unresolved repository; snapshot write remains atomic).
- **SC-003**: Identical re-declarations across load chains produce exactly one record per repository (zero duplicate records), with all provenance paths listed.
- **SC-004**: Divergent re-declarations are always surfaced as conflicts with non-zero exit — zero instances of silent adoption; checkout refuses conflicted repositories 100% of the time.
- **SC-005**: After checkout with a non-default alias, applying the project's own build setup resolves the external repository with rewritten URLs effective through the injected patch; `checkout default` restores the entry files byte-identically (verified by content hash) and leaves zero generated patch files behind.
- **SC-006**: Checkout runs remain near-instant for the patch path (text-level generation and attribute injection only; no network beyond what target resolution already requires).

## Assumptions

- WORKSPACE-style entry-file archive declarations are the first-class injection point; module-based introduction of the dependency is supported on a best-effort basis with graceful degradation (FR-016).
- The Bazel working area layout may vary across Bazel generations; tolerant name matching covers common variants, and unresolvable cases degrade to warnings (never errors that abort discovery).
- Temporary download fallback targets only dependencies already declared with a digest; it never persists content into the objects store or mirror — it exists solely to read bzl files.
- One patch file per external repository; patch content is deterministic given the same inputs (stable ordering) so repeated runs produce identical files.
- The mirror's byte-identical storage guarantees declared digests stay valid after URL rewrites; if a future target type violates this (different bytes), digest rewriting becomes a separate feature.
- Traversal depth bound of 32 layers is sufficient for realistic dependency graphs.
