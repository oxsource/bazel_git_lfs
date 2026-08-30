# bazel-git-lfs

**bazel-git-lfs** is a lightweight CLI tool that discovers, downloads, verifies, and mirrors Bazel remote HTTP dependencies (`http_archive`/`http_file` in `WORKSPACE`/`MODULE.bazel`) using a shared Git LFS repository.

## Overview

The tool follows a mirror-based workflow: inspect your project's dependencies, fetch them from their origin URLs, push them to a shared mirror repository, and pull them from the mirror on other machines — all with SHA256 integrity verification.

## Quick Start

```bash
npm install -g bazel-git-lfs
cd /path/to/your/project
bazel-git-lfs init
bazel-git-lfs remote add --url git@github.com:my-org/mirror.git
bazel-git-lfs inspect
bazel-git-lfs fetch
bazel-git-lfs push
```

See the [[Quickstart]] for a complete walkthrough.

## Workflow

```
                    ┌──────────┐
                    │  Inspect  │
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │  Fetch   │
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │   Push   │
                    └────┬─────┘
                         │
               ┌─────────▼─────────┐
               │  Mirror Repository │
               └─────────┬─────────┘
                         │
                    ┌────▼─────┐
                    │   Pull   │
                    └────┬─────┘
                         │
                    ┌────▼──────┐
                    │  Checkout  │
                    └───────────┘
```

## Getting Started

| Page | Description |
|------|-------------|
| [[Installation]] | System requirements, npm install, verify installation |
| [[Quickstart]] | Step-by-step tutorial for the complete workflow |

## Command Reference

| Page | Description |
|------|-------------|
| [[Commands-init\|init]] | Create the config area in a project |
| [[Commands-remote\|remote]] | Manage mirror repository profiles |
| [[Commands-inspect\|inspect]] | Scan Bazel project files for dependencies |
| [[Commands-fetch\|fetch]] | Download dependencies from origin URLs |
| [[Commands-push\|push]] | Upload objects to the mirror repository |
| [[Commands-pull\|pull]] | Download objects from the mirror repository |
| [[Commands-status\|status]] | Check mirror status and integrity |
| [[Commands-clean\|clean]] | Remove local objects, mirror clone, and snapshot |
| [[Commands-checkout\|checkout]] | Switch dependency URLs between sources |

## Advanced Topics

| Page | Description |
|------|-------------|
| [[Configuration]] | Config file format, profiles, aliases, environment variables |
| [[Architecture]] | Objects store, mirror manifest, checkout state, pre-commit hook |
| [[Troubleshooting]] | Common errors, causes, and solutions |
| [[CI-CD]] | Using bazel-git-lfs in CI/CD pipelines |