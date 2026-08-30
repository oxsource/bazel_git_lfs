# Installation

## System Requirements

- **Node.js** ≥ 18 (LTS recommended)
- **git** (any recent version)
- **git-lfs** (Git Large File Storage — required for mirror push/pull)

Verify your installed versions:

```bash
node --version
git --version
git lfs version
```

## Install Globally (Recommended)

Install `bazel-git-lfs` as a global npm package:

```bash
npm install -g bazel-git-lfs
```

After installation, verify the tool is available:

```bash
bazel-git-lfs --version
```

You should see the version number (e.g., `1.0.0`).

## Use Without Global Install (npx)

If you prefer not to install globally, use `npx` to run the tool without installing it permanently:

```bash
npx bazel-git-lfs init
npx bazel-git-lfs inspect
npx bazel-git-lfs fetch
```

Each `npx` invocation downloads the package on demand and caches it for future use.

## Verify Installation

Run the help command to confirm all commands are available:

```bash
bazel-git-lfs --help
```

You should see usage information for all commands: `init`, `remote`, `inspect`, `fetch`, `push`, `pull`, `status`, `clean`, and `checkout`.

## Next Steps

- Follow the [[Quickstart]] to set up your first project
- See [[Commands]] for the full command reference
- See [[Configuration]] for profile and alias setup