# inspect

## Purpose

Scan Bazel project files for HTTP dependencies. Parses `WORKSPACE`, `WORKSPACE.bazel`, and `MODULE.bazel` files (plus any `load()`ed `.bzl` files) and extracts `http_archive`/`http_file` rules with their URLs, SHA256 digests, and strip prefixes.

## Usage

```
bazel-git-lfs inspect
```

## Options

No options (output is always JSON).

## Examples

Inspect a project:

```bash
bazel-git-lfs inspect
```

## JSON Output

```json
{
  "ok": true,
  "projectDir": "/path/to/project",
  "dependencies": [
    {
      "name": "react",
      "urls": ["https://.../react.tar.gz"],
      "sha256": "15a019bd...",
      "stripPrefix": null,
      "sourceFile": "WORKSPACE",
      "resolved": true
    }
  ],
  "filesScanned": ["WORKSPACE"],
  "warnings": [],
  "queryUsed": false,
  "queryExternalRepos": null,
  "dependencyRelations": null
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Inspection completed successfully |
| 1 | Error (e.g., project not initialized) |

## Notes

- `inspect` is read-only — it does not download or modify any files
- Results are persisted to `.bazel_git_lfs/dependencies.json` for use by `fetch` and other commands
- If `bazel query` is available and the project uses Bzlmod, it may be used for additional resolution