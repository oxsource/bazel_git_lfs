# Feature Specification: GitHub Release Packaging

**Date**: 2026-08-30
**Status**: Draft

## Summary

Provide comprehensive documentation covering build management, tool installation, and usage instructions for `bazel-git-lfs`. The documentation lives in the GitHub Wiki and targets end-users who need to install, configure, and use the CLI in their Bazel projects. No custom build pipeline or GitHub Release binary distribution is required — the existing npm package remains the primary distribution channel.

## Clarifications

### Session 2026-08-30

- Q: 文档与构建优先级 → A: 纯文档，无构建
- Q: 文档格式 → A: GitHub Wiki
- Q: 文档受众 → A: 终端用户（安装与使用）

## User Scenarios

### Scenario 1: First-time user installation

A Bazel project developer encounters `bazel-git-lfs` for the first time. They open the GitHub Wiki, follow the installation guide to run `npm install -g bazel-git-lfs` (or `npx bazel-git-lfs`), then follow the quickstart to initialize their project and mirror dependencies.

### Scenario 2: Understanding the workflow

A developer reads the Wiki to understand the end-to-end workflow: inspect → fetch → push → pull → checkout. They learn which commands to run in which order and what each command does.

### Scenario 3: Troubleshooting

A developer encounters an error during fetch or push. They consult the Wiki's troubleshooting section to diagnose common issues (hash mismatch, missing manifest, network errors) and find resolution steps.

### Scenario 4: CI/CD setup reference

A DevOps engineer setting up a CI pipeline reads the Wiki to learn how to install `bazel-git-lfs` on a CI runner (via npm) and which commands to run in the build script.

## Functional Requirements

### FR-001: Installation guide

The Wiki provides clear installation instructions covering:
- Global install via `npm install -g bazel-git-lfs`
- Per-project usage via `npx bazel-git-lfs`
- Verifying installation (`bazel-git-lfs --version`)
- System requirements (Node.js ≥ 18, git, git-lfs)

### FR-002: Quickstart tutorial

A step-by-step quickstart tutorial walks a new user through the complete workflow:
1. Run `init` to create the config area
2. Run `remote add` to configure a mirror repository
3. Run `inspect` to scan Bazel dependencies
4. Run `fetch` to download dependency artifacts
5. Run `push` to upload to the mirror
6. Run `pull` to download from the mirror
7. Run `checkout` to switch between source URLs

### FR-003: Command reference

Each CLI command has a dedicated Wiki page documenting:
- Purpose and when to use it
- Usage syntax and all options/flags
- Examples with common use cases
- Exit codes and their meanings
- JSON output format (where applicable)

### FR-004: Configuration reference

The Wiki documents the configuration system:
- Config file location and format (`.bazel_git_lfs/config.json`)
- Profile management (local vs global scope)
- Alias system for mirror URLs
- Environment variables (`BAZEL_GIT_LFS_HOME`)

### FR-005: Architectural overview

A high-level architecture page explains:
- How the tool interacts with git, git-lfs, and the mirror repository
- The objects store layout under `.bazel_git_lfs/objects/`
- The mirror manifest and its role
- The checkout state mechanism and pre-commit hook

### FR-006: Troubleshooting guide

A troubleshooting page addresses common issues:
- "Not a valid bazel_git_lfs project" — missing init
- Hash mismatch errors during fetch
- Mirror not configured errors
- Permission issues with config files
- LFS-related errors during push/pull
- Pre-commit hook not running

### FR-007: CI/CD integration guide

A dedicated page explains how to use `bazel-git-lfs` in CI:
- Installing on CI runners
- Recommended command sequence for CI pipelines
- Using `--json` output for machine-readable results
- Exit code conventions for build script integration

### FR-008: Wiki structure and navigation

The Wiki is organized with a clear hierarchy:
- Home page with overview and links to all sections
- Sidebar navigation grouping related topics
- Cross-references between related pages
- Searchable content (GitHub Wiki built-in search)

## Non-Requirements

- No custom build pipeline or GitHub Release binary distribution
- No standalone binary packaging (npm is the only distribution channel)
- No OS-specific package manager publishing (Homebrew, apt, etc.)
- No code signing or notarization
- No automatic update mechanism

## Success Criteria

1. A first-time user can install `bazel-git-lfs` and complete the quickstart workflow without external support — verified by user testing.
2. Each CLI command has a dedicated Wiki page with syntax, options, and at least one example — verified by page inventory.
3. The troubleshooting guide resolves the 5 most common user-reported errors — verified by support log analysis.
4. CI/CD integration page documents a complete build script example that can be copy-pasted — verified by script working in a clean CI environment.
5. Wiki search returns relevant results for key terms ("install", "fetch", "push", "checkout", "init") — verified by manual search test.

## Dependencies

- GitHub Wiki feature enabled on the repository
- npm package `bazel-git-lfs` published and installable

## Assumptions

- The existing npm package (`bazel-git-lfs`) is the sole distribution channel
- GitHub Wiki is writable by project maintainers
- Users have Node.js ≥ 18, git, and git-lfs installed
- The CLI commands and their behavior are stable (no breaking changes mid-documentation)