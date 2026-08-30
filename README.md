# bazel-git-lfs

Discover and mirror Bazel remote HTTP dependencies into a shared Git LFS repository.

## Architecture

`bazel-git-lfs` uses an **interception/passthrough** pattern:

- `.bazel_git_lfs/objects/` is an inner git repository managed via Git LFS
- Only 4 custom commands: `init`, `inspect`, `clean`, `checkout`
- All other commands (`fetch`, `push`, `pull`, `remote`, `status`, `log`, `branch`, etc.) transparently pass through to `git -C .bazel_git_lfs/objects <args>`
- `checkout` is hybrid: `--`/`@` → custom URL replacement; `<branch>` → git checkout + custom patch
- Post-hooks: branch naming suggestion after `remote add`

## Quickstart

```bash
# Initialize the project (creates .bazel_git_lfs/ + inner git repo)
bazel-git-lfs init

# Scan Bazel dependencies (cached, use -f to force re-scan)
bazel-git-lfs inspect

# Add a mirror remote
bazel-git-lfs remote add origin git@github.com:org/mirror.git

# Fetch/push/pull are passthrough to git
bazel-git-lfs fetch origin
bazel-git-lfs push origin main
bazel-git-lfs pull origin

# Checkout switches dependency URLs
bazel-git-lfs checkout --          # restore original URLs
bazel-git-lfs checkout @           # switch to local file:// paths
bazel-git-lfs checkout <branch>    # git checkout + URL patch

# Clean removes everything
bazel-git-lfs clean
```

## Documentation

Wiki pages are maintained under [`docs/wiki/`](docs/wiki/):

| Page | Description |
|------|-------------|
| [Home](docs/wiki/Home.md) | Overview and quick links |
| [Installation](docs/wiki/Installation.md) | System requirements, npm install, verify |
| [Quickstart](docs/wiki/Quickstart.md) | Step-by-step tutorial |
| [Commands](docs/wiki/Commands.md) | Command reference overview |
| [Configuration](docs/wiki/Configuration.md) | Config file format, profiles, aliases |
| [Architecture](docs/wiki/Architecture.md) | Design overview |
| [Troubleshooting](docs/wiki/Troubleshooting.md) | Common errors |
| [CI-CD](docs/wiki/CI-CD.md) | CI/CD pipeline usage |

> These files are the source for the [GitHub Wiki](https://github.com/oxsource/bazel_git_lfs/wiki). See [`docs/wiki/README.md`](docs/wiki/README.md) for publishing instructions.