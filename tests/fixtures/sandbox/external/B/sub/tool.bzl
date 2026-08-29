"""Second-layer bzl loaded from B's deps.bzl, for testing nested external loads."""

def toolchain_deps():
    http_archive(
        name = "rules_cc",
        urls = ["https://example.com/rules_cc-0.1.tar.gz"],
        sha256 = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    )