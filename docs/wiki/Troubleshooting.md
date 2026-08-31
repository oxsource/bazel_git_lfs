# Troubleshooting

## "Not a valid bazel_git_lfs project"

**Error**: `Not a valid bazel_git_lfs project: <path>. Run "bazel-git-lfs init" first.`

**Cause**: The command requires an initialized config area, but `.bazel_git_lfs/` does not exist in the project directory.

**Solution**: Run `bazel-git-lfs init` in the project root to create the config directory.

## SHA256 Hash Mismatch

**Error**: `object content does not match declared sha256`

**Cause**: The downloaded artifact's content does not match the SHA256 digest declared in the Bazel file. This could indicate:
- A corrupted download
- The source artifact was updated without updating the declared SHA256
- A man-in-the-middle attack

**Solution**:
1. Run `bazel-git-lfs fetch` again — the tool retries from the origin URL
2. If the error persists, verify the declared SHA256 in your `WORKSPACE`/`MODULE.bazel` file matches the upstream artifact
3. If the upstream artifact has changed, update the SHA256 in your Bazel file

## "all 1 source URL(s) failed"

**Error**: `all 1 source URL(s) failed`

**Cause**: All origin URLs for a dependency failed to deliver a valid artifact. Possible causes:
- Network connectivity issues
- The origin server is down or unreachable
- The URL is incorrect or the artifact was removed

**Solution**:
1. Check your network connection
2. Verify the URL in your Bazel file is accessible
3. If the URL requires authentication, ensure your git credentials are configured

## Mirror Push Fails

**Error**: `git push failed` or `git commit failed`

**Cause**: The tool could not commit or push to the mirror repository. Possible causes:
- No write access to the mirror repository
- The mirror repository does not exist
- Git LFS is not installed or configured on the mirror
- Authentication failure

**Solution**:
1. Verify you have write access to the mirror repository
2. Ensure Git LFS is installed: `git lfs version`
3. Check your git remote configuration: `git remote -v` (inside `.bazel_git_lfs/mirror/`)
4. Run `bazel-git-lfs push` again — it may recover from a transient failure

## Permission Issues

**Error**: `EACCES: permission denied` or `Cannot create config directory`

**Cause**: The tool does not have permission to read or write to the config directory or files.

**Solution**:
1. Check file ownership: `ls -la .bazel_git_lfs/`
2. Fix permissions: `chown -R <your-user> .bazel_git_lfs/`
3. Ensure the project directory is writable

## Pre-commit Hook Not Running

**Symptom**: Commits go through even when a non-default checkout is active.

**Solution**:
1. Verify the hook is installed: `ls -la .git/hooks/pre-commit`
2. Ensure the hook is executable: `chmod +x .git/hooks/pre-commit`
3. Verify the hook content: `cat .git/hooks/pre-commit`
4. Re-run `bazel-git-lfs init` to reinstall the hook

## Command Not Found

**Error**: `command not found: bazel-git-lfs`

**Cause**: The tool is not installed or not on your PATH.

**Solution**:
1. Install globally: `npm install -g bazel-git-lfs`
2. Verify the installation: `npm list -g bazel-git-lfs`
3. Check that the npm global bin directory is on your PATH: `npm config get prefix` then check the `bin/` subdirectory

## Unexpected JSON Output

**Symptom**: The `--json` flag produces unexpected output.

**Solution**: All commands that support `--json` output structured JSON. If you see raw text output, verify:
1. The `--json` flag is placed after the command name (e.g., `bazel-git-lfs inspect --json`, not `bazel-git-lfs --json inspect`)
2. The command supports the `--json` flag (check `--help` for each command)