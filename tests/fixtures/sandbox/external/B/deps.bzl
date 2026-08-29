"""Dependencies declared inside external repository B, loaded via @B//:deps.bzl."""

def setup_b():
    http_archive(
        name = "openssl",
        urls = ["https://example.org/openssl-1.1.1.tar.gz"],
        sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        strip_prefix = "openssl-1.1.1",
    )

    http_file(
        name = "patch_xyz",
        urls = ["https://example.com/patches/xyz.patch"],
        sha256 = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    )