# Quickstart: Mirror Upstream Flow

```bash
# 1. Initialize the project (creates .bazel_git_lfs/ + inner git repo)
bazel-git-lfs init

# 2. Scan Bazel dependencies (writes snapshot to .bazel_git_lfs/)
bazel-git-lfs inspect

# 3. Add a mirror remote (passthrough to inner git repo)
bazel-git-lfs remote add origin git@github.com:oxsource/mirror.git
# The tool will suggest: "Bind upstream? oxsource_<feature>"

# 4. Fetch from mirror (passthrough with upstream check)
bazel-git-lfs fetch origin main

# 5. Or push to mirror
bazel-git-lfs push origin main

# 6. Check status of inner repo
bazel-git-lfs status

# 7. Clean everything
bazel-git-lfs clean
```