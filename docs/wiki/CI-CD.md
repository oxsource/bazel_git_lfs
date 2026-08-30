# CI/CD Integration

This guide explains how to use `bazel-git-lfs` in CI/CD pipelines. The tool is designed for automation — all commands support `--json` output for machine-readable results and follow consistent exit code conventions.

## Installation on CI Runners

### GitHub Actions

```yaml
- name: Install bazel-git-lfs
  run: npm install -g bazel-git-lfs
```

### GitLab CI

```yaml
before_script:
  - npm install -g bazel-git-lfs
```

### Jenkins / General CI

```bash
npm install -g bazel-git-lfs
```

## Recommended Pipeline Sequence

### Fetch Project (Download from Mirror)

```yaml
- name: Initialize and pull from mirror
  run: |
    bazel-git-lfs init
    bazel-git-lfs remote add --url $MIRROR_URL
    bazel-git-lfs pull
```

### Push Project (Upload to Mirror)

```yaml
- name: Inspect, fetch, and push to mirror
  run: |
    bazel-git-lfs init
    bazel-git-lfs remote add --url $MIRROR_URL
    bazel-git-lfs inspect
    bazel-git-lfs fetch
    bazel-git-lfs push
```

## JSON Output for Machine Processing

Use `--json` to get structured output that can be parsed by CI systems:

```bash
# Fetch with JSON output
bazel-git-lfs fetch --json > fetch-result.json

# Parse with jq in CI scripts
jq '.summary' fetch-result.json
# Output: { "total": 2, "fetched": 2, "cached": 0, "failed": 0 }
```

### Fetch JSON Output

```json
{
  "ok": true,
  "command": "fetch",
  "projectDir": "/path/to/project",
  "objectsDir": "/path/to/project/.bazel_git_lfs/objects",
  "results": [
    {
      "name": "react",
      "sha256": "15a019bd...",
      "status": "fetched",
      "path": "..."
    }
  ],
  "warnings": [],
  "summary": {
    "total": 2,
    "fetched": 2,
    "cached": 0,
    "failed": 0
  }
}
```

### Push JSON Output

```json
{
  "ok": true,
  "command": "push",
  "pushed": true,
  "commit": "abc123...",
  "results": [
    {
      "name": "react",
      "sha256": "15a019bd...",
      "status": "uploaded"
    }
  ],
  "summary": {
    "total": 2,
    "uploaded": 2,
    "already-mirrored": 0,
    "missing-local": 0,
    "failed": 0
  }
}
```

## Exit Code Conventions

All commands follow the same exit code convention:

| Code | Meaning | CI Handling |
|------|---------|-------------|
| 0 | Success | Proceed to next step |
| 1 | Error | Fail the pipeline step |
| 2 | Usage error | Fail the pipeline step (check arguments) |

In most CI systems, a non-zero exit code automatically fails the step. You can use the `--json` flag to capture structured error information:

```bash
if ! bazel-git-lfs fetch --json > result.json; then
  ERROR=$(jq -r '.error // "unknown error"' result.json)
  echo "Fetch failed: $ERROR"
  exit 1
fi
```

## Examples

### GitHub Actions: Mirror Dependencies

```yaml
name: Mirror Dependencies
on:
  push:
    branches: [main]
jobs:
  mirror:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - name: Install bazel-git-lfs
        run: npm install -g bazel-git-lfs
      - name: Inspect and fetch
        run: |
          bazel-git-lfs init
          bazel-git-lfs inspect
          bazel-git-lfs fetch
      - name: Push to mirror
        env:
          MIRROR_URL: ${{ secrets.MIRROR_URL }}
        run: |
          bazel-git-lfs remote add --url "$MIRROR_URL"
          bazel-git-lfs push
```

### GitLab CI: Consume from Mirror

```yaml
consume-mirror:
  stage: build
  script:
    - npm install -g bazel-git-lfs
    - bazel-git-lfs init
    - bazel-git-lfs remote add --url "$MIRROR_URL"
    - bazel-git-lfs pull
    - bazel-git-lfs checkout default
```