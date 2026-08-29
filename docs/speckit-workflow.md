# speckit 通用工作流指南 (General speckit Workflow Guide)

**位置**: 全局 docs 目录 | **适用**: 所有使用 speckit 进行需求规划与实施的项目

**目的**: 规范本项目使用 speckit 的通用流程。核心思路是 **先建立大的流程目标与架构纲领规划，再分"设计规划指导"具体实施**。本文件供 agent 在规划与实施时参照，避免越级细化或遗漏阶段关联。

---

## 1. 核心原则 (Core Principles)

1. **顶层规划与具体实施分离**：先做整体需求规格与阶段级架构规划，明确"分几个阶段、每个阶段大致做什么"；不在此层分析具体任务。
2. **设计规划指导 (Design Planning Guide)**：每个阶段对应一份独立的**设计规划指导**，单独创建（单独提按），负责该阶段的具体设计、任务拆分与实施。顶层文档与设计规划指导之间通过链接关联。
3. **任务清单保持阶段级**：`tasks.md` 只按阶段简单列出任务，每一项关联对应阶段的设计规划指导；设计规划指导交付后，回填链接并勾选完成。
4. **逐阶段推进**：一个阶段的设计规划指导完成后，再更新该阶段任务；不一次性分析所有阶段的具体工作。

---

## 2. 术语表 (Terminology)

| 术语 | 英文 | 含义 |
|------|------|------|
| 设计规划指导 | Design Planning Guide | 针对单个阶段的具体设计、任务拆分与实施文档（单独提按）。**不再使用"提按/提案"等旧称呼。** |
| 阶段 | Stage | 顶层规划中定义的交付阶段（如 S1–S6），由 plan.md 定义范围与退出信号 |
| 阶段任务 | Stage Task | tasks.md 中按阶段列出的清单项，与设计规划指导关联 |
| 规格 | Spec | 需求规格文档 spec.md，描述需求、用户故事、验收标准 |
| 规划 | Plan | 顶层规划文档 plan.md，只做阶段拆分与大纲 |

---

## 3. 通用工作流 (General Workflow)

### 阶段 A：顶层规划（一次性完成）

1. **`/speckit.specify`** → 生成 `spec.md`（需求规格：用户故事、功能需求、成功标准、假设）。
2. **`/speckit.clarify`** → 澄清需求歧义，并将澄清结论回写进 spec.md（记录到 `## Clarifications`）。
3. **`/speckit.plan`** → 生成 `plan.md`：
   - 只做 **阶段拆分**（Stage 划分）与每个阶段的**大致内容**、**退出信号**、**需求覆盖**。
   - **不**分析具体任务、模块结构、代码级设计。
4. **`tasks.md`**（阶段任务清单）：
   - 按阶段简单列出任务（每个阶段一项或少数几项）。
   - 每项关联对应阶段的设计规划指导链接（待创建时用占位符 `#<design-planning-guide-link>`）。
   - plan.md 每个阶段段落中也标注 `**设计规划指导**` 链接，形成双向关联。

### 阶段 B：逐阶段实施（每阶段循环）

1. 为当前阶段 **单独创建设计规划指导**（单独提按），引用 plan.md 中该阶段的范围、大致内容与退出信号。
2. 在该设计规划指导内完成具体设计、任务拆分与实施（含该阶段自己的详细分析）。
3. 阶段交付后，**更新 tasks.md**：
   - 将该阶段任务的 `#<design-planning-guide-link>` 替换为实际链接；
   - 将对应复选框勾选为 `[x]`。
4. 进入下一阶段，重复循环。

### 流程图

```text
specify (spec.md)
   │
   ▼
clarify ──→ 澄清回写 spec.md
   │
   ▼
plan (plan.md: 阶段拆分 + 大纲，不做具体任务)
   │
   ▼
tasks.md (阶段级清单，每项 ↔ 设计规划指导)
   │
   ▼  (逐阶段循环)
设计规划指导（单独提按）─→ 具体设计/任务/实施 ─→ 完成
   │                                        │
   └────────────────────────────────────────┘
        更新 tasks.md：填链接 + 勾选 [x]
```

---

## 4. 文件布局与职责

```text
docs/                                  # 全局文档
├── project_bootstrap.md               # 项目引导：原始需求、架构分析、核心设计原则
└── speckit-workflow.md                # 本文件：通用 speckit 流程
specs/<###-feature>/                   # 每个 feature 的规格目录
├── spec.md                            # 需求规格（顶层）
├── plan.md                            # 阶段规划（顶层，只做阶段拆分）
├── tasks.md                           # 阶段任务清单（与设计规划指导关联）
├── research.md                        # （参考）技术调研结论
├── data-model.md                      # （参考）数据模型
├── quickstart.md                      # （参考）快速上手
└── contracts/                         # （参考）接口契约
```

> 说明：`research.md` / `data-model.md` / `quickstart.md` / `contracts/` 等产物允许在具体阶段的设计规划指导中被拆分或重新组织，不必保持整体一致。

---

## 5. Agent 执行规则 (Rules for Agents)

1. **规划时**：只输出阶段拆分与大纲。被要求"plan"时，产出到 `plan.md` 为止，**不要**深入到任务/模块/代码级。
2. **实施某阶段时**：先查找该阶段的设计规划指导，按其执行；不要自行重新做顶层规划。
3. **阶段完成后**：必须更新 `tasks.md`（回填设计规划指导链接 + 勾选 `[x]`）。
4. **术语一致性**：一律使用 **设计规划指导 (Design Planning Guide)**，不再使用"提按/提案"等旧称呼。
5. **链接维护**：plan.md 与 tasks.md 之间的阶段↔设计规划指导链接必须保持同步，避免单向失效。

---

## 6. 当前 Feature 实例（bazel-git-lfs, 001-bazel-git-lfs-guide）

作为示例，当前 feature 已按本流程拆分为 6 个阶段：

| Stage | 名称 | 设计规划指导 |
|-------|------|--------------|
| S1 | Foundation & Config | [tasks.md T001](./../specs/001-bazel-git-lfs-guide/tasks.md) (待创建) |
| S2 | Discovery (`scan`) | [tasks.md T002](./../specs/001-bazel-git-lfs-guide/tasks.md) (待创建) |
| S3 | Mirroring Core (`sync`) | [tasks.md T003](./../specs/001-bazel-git-lfs-guide/tasks.md) (待创建) |
| S4 | Mirror Consumption (`verify`/`list`/`search`) | [tasks.md T004](./../specs/001-bazel-git-lfs-guide/tasks.md) (待创建) |
| S5 | Business Project Checkout (`checkout`) | [tasks.md T005](./../specs/001-bazel-git-lfs-guide/tasks.md) (待创建) |
| S6 | Packaging & Release | [tasks.md T006](./../specs/001-bazel-git-lfs-guide/tasks.md) (待创建) |

详细说明见 `specs/001-bazel-git-lfs-guide/plan.md` 与 `tasks.md`。
