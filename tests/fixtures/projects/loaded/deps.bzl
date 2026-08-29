"""Dependencies declared in a helper .bzl file, loaded from WORKSPACE."""

def fixture_deps():
    http_archive(
        name = "zlib",
        url = "https://github.com/madler/zlib/archive/refs/tags/v1.3.1.tar.gz",
        sha256 = "8888888888888888888888888888888888888888888888888888888888888888",
    )

    http_file(
        name = "cmake_patch",
        url = "https://example.com/patches/cmake.patch",
        sha256 = "9999999999999999999999999999999999999999999999999999999999999999",
    )
