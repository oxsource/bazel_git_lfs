/**
 * Template for the project-local `.bazel_git_lfs/.bazelconfig` INI file.
 * Written by `bazel-git-lfs init --with-bazelconfig`.
 * Mirrors the "Empty Template" in docs/wiki/BazelConfig.md.
 */
export const BAZELCONFIG_TEMPLATE = `# .bazel_git_lfs/.bazelconfig
# bazel-git-lfs project config (INI format)

[server]
# Local object HTTP server port (default: 8022).
# port = 8022

[inspect]
# Dependencies to EXCLUDE from archiving (exact name match).
# exclude = some_dep
# exclude += another_dep

# Dependencies the scan MISSED — add them manually.
# Format: name|urls(comma-separated)|sha256[|stripPrefix]
# append = manual_dep|https://example.org/m.tar.gz|<sha256>
# append += other_dep|https://example.org/o.tar.gz|<sha256>|third_party
`;
