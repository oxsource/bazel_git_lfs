# Project Bootstrap: bazel-git-lfs

## 1. 项目名称

**bazel-git-lfs**

## 2. 项目背景

目前多个 Bazel 项目依赖大量通过 HTTP/HTTPS 获取的第三方依赖，例如：

* `.tar.gz`
* `.zip`
* `.patch`
* 其他 Bazel `http_archive` / `http_file` 等远程资源

典型依赖来源包括 GitHub 等公网代码仓库。

当前存在以下问题：

1. 多个 Bazel 项目可能重复下载相同的第三方依赖。
2. CI 构建环境需要反复访问 GitHub 等公网服务。
3. 部分开发/构建环境访问 GitHub 速度较慢或不稳定。
4. 第三方依赖的版本和 SHA256 已经由 Bazel 项目确定，但缺少统一的公司级缓存/镜像管理机制。
5. 目前没有必要直接引入 Nexus、Nexspence、MinIO 等较重的 Artifact Repository 基础设施。

因此，希望建立一个轻量级的 Bazel 依赖镜像工具，优先利用现有 Git/GitLab 基础设施解决问题。

---

## 3. 核心目标

开发一个基于 Node.js 的命令行工具 **bazel-git-lfs**。

工具负责：

```text
Bazel Project
      ↓
解析 Bazel 外部 HTTP 依赖
      ↓
获取 URL + SHA256 等信息
      ↓
检查本地缓存
      ↓
缺失则从原始 URL 下载
      ↓
SHA256 校验
      ↓
写入 Git LFS Repository
      ↓
git commit
      ↓
git push
```

最终形成统一的公司 Bazel 依赖镜像仓库。

---

## 4. 目标使用场景

假设公司存在多个 Bazel 项目：

```text
graph_runtime
cpp_network
medias
```

这些项目可能同时依赖：

```text
abseil
protobuf
googletest
libcurl
openssl
libdatachannel
...
```

期望形成：

```text
                    GitLab
                      │
              bazel-git-lfs
                      │
                 Git + LFS
                      │
        ┌─────────────┼─────────────┐
        │             │             │
   graph_runtime  cpp_network     medias
        │             │             │
        └─────────────┼─────────────┘
                      │
                Bazel Dependencies
```

同一个第三方依赖只需要在镜像仓库中保存一份。

---

## 5. 为什么选择 Git LFS

Bazel 的第三方 HTTP 依赖本质上是发布制品，而不是项目源码。

因此不希望将大量 `.tar.gz` / `.zip` 直接提交到普通 Git history。

Git LFS 可以将：

```text
Git
 └── metadata / pointer

Git LFS
 └── large binary artifacts
```

分离。

公司已有自建 GitLab，并且 GitLab 支持 Git LFS，因此第一阶段无需额外部署 Artifact Repository。

目标架构：

```text
GitLab
├── Git Repository
│   ├── manifest
│   ├── metadata
│   ├── scripts
│   └── configuration
│
└── Git LFS
    ├── *.tar.gz
    ├── *.zip
    └── *.patch
```

---

## 6. 为什么暂时不使用 Nexus / Nexspence / MinIO

这些方案未来可能成为更成熟的 Artifact Repository 或 Object Storage 层，但当前阶段存在：

* 部署成本
* 运维成本
* 权限管理成本
* 基础设施复杂度
* 对当前需求而言功能过剩

当前核心需求只是：

> 将 Bazel 项目的远程 HTTP 依赖集中缓存，并通过公司已有 GitLab 基础设施进行管理和复用。

因此第一阶段优先采用：

```text
GitLab + Git + Git LFS
```

未来可以平滑演进到：

```text
GitLab LFS
      ↓
Nexus / Nexspence
      ↓
S3 / MinIO / Object Storage
```

工具内部应避免将 Repository Backend 与 Bazel Dependency Parsing 强耦合。

---

## 7. Bazel 依赖发现

第一阶段重点支持 Bazel 中的远程 HTTP 依赖。

需要考虑：

```text
WORKSPACE
WORKSPACE.bazel
MODULE.bazel
```

以及常见规则：

```text
http_archive
http_file
```

后续根据实际需求扩展。

典型输入：

```python
http_archive(
    name = "abseil",
    urls = [
        "https://github.com/abseil/abseil-cpp/archive/refs/tags/20250127.0.tar.gz"
    ],
    sha256 = "..."
)
```

工具需要提取：

```text
name
url / urls
sha256
strip_prefix
其他与镜像相关的必要 metadata
```

---

## 8. 本地缓存

为了进一步降低同步压力，工具需要提供本地缓存。

目标：

```text
第一次：

Bazel Project
    ↓
bazel-git-lfs
    ↓
GitHub
    ↓
local cache
    ↓
Git LFS
```

后续项目：

```text
Bazel Project
    ↓
bazel-git-lfs
    ↓
local cache HIT
    ↓
Git LFS
```

缓存应优先以 **SHA256** 作为内容唯一标识，而不是单纯以 URL 作为 key。

原因：

```text
不同 URL
   ↓
相同 SHA256
   ↓
相同 Artifact
```

从而避免重复保存相同内容。

---

## 9. 完整性校验

下载第三方依赖后必须进行 SHA256 校验。

流程：

```text
Download
   ↓
SHA256
   ↓
Compare Bazel declared sha256
   ↓
MATCH
   ↓
Store
```

如果校验失败：

```text
Download
   ↓
SHA256 mismatch
   ↓
Abort
   ↓
禁止进入 mirror
```

不能因为下载成功而跳过完整性校验。

---

## 10. Mirror Repository

建议建立统一 GitLab Repository：

```text
bazel/bazel-mirror
```

仓库职责：

> 保存所有公司 Bazel 项目共享的第三方 HTTP dependency artifacts。

推荐结构：

```text
bazel-mirror/
├── .gitattributes
├── manifest.json
├── README.md
├── scripts/
└── artifacts/
    ├── abseil/
    │   └── 20250127.0.tar.gz
    ├── protobuf/
    │   └── 30.0.tar.gz
    ├── googletest/
    │   └── 1.15.0.tar.gz
    └── ...
```

其中：

* Git 管理 metadata、manifest、scripts 等。
* Git LFS 管理大型 archive 文件。

---

## 11. Manifest

建议维护统一的 `manifest.json`。

示例：

```json
{
  "artifacts": {
    "abseil-20250127.0": {
      "source": "https://github.com/abseil/abseil-cpp/archive/refs/tags/20250127.0.tar.gz",
      "sha256": "...",
      "path": "artifacts/abseil/20250127.0.tar.gz"
    }
  }
}
```

Manifest 用于：

* 判断 artifact 是否已经镜像
* 根据 SHA256 查找 artifact
* 记录原始来源
* 记录镜像路径
* 后续生成/维护 Bazel mirror URL
* 完整性检查
* 审计和追踪

---

## 12. Git 操作

第一阶段不自行实现 Git/Git LFS 协议。

Node.js 工具直接调用系统：

```text
git
git-lfs
```

典型流程：

```text
git clone
    ↓
git lfs install
    ↓
download artifact
    ↓
git lfs add / track
    ↓
git add
    ↓
git commit
    ↓
git push
```

这样可以降低实现复杂度，并充分利用成熟的 Git/Git LFS 工具链。

---

## 13. CLI 初步设想

### 初始化

```bash
bazel-git-lfs init
```

用于初始化本地配置。

### 扫描

```bash
bazel-git-lfs scan ./graph_runtime
```

扫描 Bazel 项目中的远程依赖，但不进行上传。

### 同步

```bash
bazel-git-lfs sync ./graph_runtime
```

执行：

```text
scan
→ resolve
→ download
→ verify
→ cache
→ Git LFS
→ commit
→ push
```

### 多项目同步

```bash
bazel-git-lfs sync \
    ./graph_runtime \
    ./cpp_network \
    ./medias
```

将多个项目发现的依赖进行去重后统一同步。

### 校验

```bash
bazel-git-lfs verify
```

检查 mirror 中的 artifact 与 manifest/SHA256 是否一致。

### 查询

```bash
bazel-git-lfs list
bazel-git-lfs search abseil
```

用于查看已有镜像。

---

## 14. Bazel URL Checkout

第一阶段不强制修改原 Bazel 项目。

工具首先负责：

```text
发现 → 缓存 → 镜像
```

后续可以增加：

```bash
bazel-git-lfs checkout production
```

将：

```python
urls = [
    "https://github.com/..."
]
```

转换为公司内部 mirror URL。

建议将：

```text
sync
```

与：

```text
checkout
```

作为两个独立能力。

这样不会因为同步工具的执行而意外修改业务项目。

---

## 15. Repository 抽象

虽然第一阶段只支持 Git LFS，但内部设计不应该把所有逻辑写死到 Git LFS。

建议抽象：

```text
ArtifactRepository
```

例如：

```typescript
interface ArtifactRepository {
    exists(sha256: string): Promise<boolean>;

    upload(artifact: Artifact): Promise<void>;

    download(artifact: Artifact): Promise<void>;

    verify(artifact: Artifact): Promise<boolean>;
}
```

第一实现：

```text
GitLfsRepository
```

未来可以扩展：

```text
GitLfsRepository
NexusRepository
NexspenceRepository
S3Repository
MinioRepository
```

这样未来迁移 Artifact Repository 时不需要重写 Bazel dependency parsing 和 cache 等核心逻辑。

---

## 16. 第一阶段明确不做的事情

V1 不追求成为完整 Artifact Repository。

暂不考虑：

* Maven Repository
* npm Registry
* Docker Registry
* 通用二进制制品管理
* 分布式对象存储
* 复杂权限系统
* Web 管理界面
* Artifact 生命周期管理
* 高可用 Artifact Storage
* 自己实现 Git/Git LFS 协议

V1 的目标非常明确：

> **解决公司多个 Bazel 项目重复下载第三方 HTTP 依赖的问题。**

---

## 17. 未来演进

### V1

```text
Bazel
  ↓
bazel-git-lfs
  ↓
GitLab + Git LFS
```

目标：

* 统一依赖
* 降低公网下载压力
* 提高 CI 稳定性
* 复用现有 GitLab

### V2

```text
Bazel
  ↓
bazel-git-lfs
  ↓
Company Artifact Mirror
  ↓
GitLab / Nexus / Nexspence
```

增加：

* HTTP mirror endpoint
* 权限
* CI 集成
* 更高并发
* 缓存服务

### V3

```text
Bazel
  ↓
Artifact Repository
  ↓
Object Storage
```

底层可以使用：

```text
S3
MinIO
SeaweedFS
其他 S3-compatible storage
```

此时 Git 只负责：

```text
metadata
configuration
scripts
manifest
```

而不再承担 artifact storage。

---

## 18. 成功标准

项目第一阶段完成后，应满足：

1. 可以扫描一个 Bazel 项目。
2. 可以发现 `WORKSPACE` / `MODULE.bazel` 中的 HTTP dependencies。
3. 可以提取 URL 和 SHA256。
4. 可以自动下载缺失 artifact。
5. 可以进行 SHA256 完整性校验。
6. 可以通过本地 cache 避免重复下载。
7. 可以将 artifact 添加到 Git LFS。
8. 可以自动 commit。
9. 可以自动 push 到指定 GitLab repository。
10. 多个 Bazel 项目共享同一个 mirror 时不会重复保存相同 artifact。
11. 不修改业务 Bazel 项目即可完成 mirror 同步。
12. 后续能够增加其他 Artifact Repository backend。

---

## 19. 核心设计原则

### 简单优先

第一阶段充分利用：

```text
Node.js
+
Git
+
Git LFS
+
GitLab
```

避免重复实现已有基础设施。

### 内容寻址优先

Artifact 的核心身份优先由：

```text
SHA256
```

确定，而不是 URL。

### 镜像与业务项目解耦

业务项目：

```text
graph_runtime
cpp_network
medias
```

不应该拥有自己的 dependency mirror。

统一使用：

```text
company/bazel-mirror
```

### Backend 可替换

不要让 Bazel parser、cache、resolver 与 Git LFS 强耦合。

### 可演进

V1 的 Git LFS 方案只是第一阶段实现。

未来可以无痛演进到：

```text
GitLab LFS
→ Artifact Repository
→ Object Storage
```

而不改变 Bazel dependency discovery 的核心模型。

---

## 20. 项目最终定位

**bazel-git-lfs 不是一个新的 Bazel 构建系统，也不是一个通用 Artifact Repository。**

它是一个：

> **面向 Bazel 外部 HTTP 依赖的自动发现、缓存、完整性校验和 Git LFS 镜像同步工具。**

核心价值：

```text
                原始公网依赖
                     │
                     ▼
              bazel-git-lfs
                     │
        ┌────────────┼────────────┐
        │            │            │
      Parse        Cache        Verify
        │            │            │
        └────────────┼────────────┘
                     ▼
                GitLab LFS
                     │
                     ▼
              公司 Bazel 项目
```

第一阶段以**降低重复公网依赖下载、提高 Bazel 构建稳定性、复用现有 GitLab 基础设施、保持实现轻量**为主要目标。
