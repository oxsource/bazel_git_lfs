import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { GitLfs, GitError } from '@/mirror/lfs';
import {
  emptyManifest,
  parseManifest,
  serializeManifest,
} from '@/mirror/manifest';
import type { MirrorManifest } from '@/mirror/models';

export interface ManifestReadResult {
  manifest: MirrorManifest;
  /** True when the mirror already holds objects/** content (any depth). */
  objectsPresent: boolean;
  /** Set when the manifest was missing/corrupt and a default was assumed. */
  warning?: string;
}

export interface UploadObject {
  /** Mirror-relative object path (directory + sha256 file name). */
  relPath: string;
  /** Absolute local source path of the verified object. */
  sourcePath: string;
}

export interface UploadResult {
  /** HEAD commit id of the mirror after the push; null when nothing changed. */
  commit: string | null;
  /** False when the mirror was already up to date (idempotent re-push). */
  pushed: boolean;
}

export interface ArtifactRepository {
  /** Clone or self-heal the disposable working clone (research decision 8). */
  ensureWorkingClone(): Promise<void>;
  /** Read the mirror manifest (empty manifest + warning when missing). */
  readManifest(): Promise<ManifestReadResult>;
  /**
   * Upload verified objects + the (already merged) manifest, commit and
   * push. Creates no commit and reports pushed=false when nothing changed.
   */
  upload(objects: UploadObject[], manifest: MirrorManifest, message: string): Promise<UploadResult>;
  /** Materialize the given object paths via `git lfs pull --include`. */
  materialize(relPaths: string[]): Promise<string[]>;
}

/**
 * Git LFS implementation of ArtifactRepository (G4: the backend stays
 * behind the interface). Keeps a disposable LFS working clone of the
 * mirror under `.bazel_git_lfs/mirror/` — never a source of truth; it is
 * reset or re-cloned before every use (research decision 4/8).
 */
export class GitLfsRepository implements ArtifactRepository {
  private readonly workDir: string;
  private readonly git: GitLfs;

  constructor(
    projectDir: string,
    public readonly remoteUrl: string,
    timeoutMs?: number,
  ) {
    this.workDir = join(projectDir, CONFIG_DIR_NAME, 'mirror');
    this.git = new GitLfs(this.workDir, timeoutMs);
  }

  get workingCloneDir(): string {
    return this.workDir;
  }

  async ensureWorkingClone(): Promise<void> {
    if (await hasWorkingClone(this.workDir)) {
      await this.resetWorkingClone();
      return;
    }
    await this.cloneWorkingClone();
  }

  private async cloneWorkingClone(): Promise<void> {
    await rm(this.workDir, { recursive: true, force: true });
    await mkdir(dirname(this.workDir), { recursive: true });
    const clone = await this.git.clone(this.remoteUrl, this.workDir, dirname(this.workDir));
    if (clone.status !== 0) {
      throw new GitError(`cannot clone mirror repository: ${summarize(clone)}`, clone);
    }
    // Repo-scoped LFS hooks; failure is tolerated (push still works via
    // explicitly installed LFS in CI images).
    await this.git.lfs(['install', '--local']);
  }

  private async resetWorkingClone(): Promise<void> {
    const fetch = await this.git.fetch();
    const branch = await this.git.currentBranch();
    const reset =
      branch !== null ? await this.git.resetClean(branch) : await this.git.resetClean('main');
    if (fetch.status !== 0 || reset.status !== 0) {
      // Dirty beyond repair (e.g. interrupted push) — re-clone from scratch.
      await this.cloneWorkingClone();
    }
  }

  async readManifest(): Promise<ManifestReadResult> {
    const manifestPath = join(this.workDir, 'manifest.json');
    const objectsPresent = await hasObjects(join(this.workDir, 'objects'));

    let raw: string | null = null;
    try {
      raw = await readFile(manifestPath, 'utf8');
    } catch {
      raw = null;
    }

    if (raw === null) {
      return {
        manifest: emptyManifest(),
        objectsPresent,
        warning: objectsPresent
          ? 'mirror contains objects but has no manifest.json; refusing to assume an empty inventory'
          : undefined,
      };
    }

    try {
      return { manifest: parseManifest(raw), objectsPresent };
    } catch (err) {
      if (objectsPresent) {
        throw err; // corrupt manifest + existing objects is fatal (never rebuild silently)
      }
      return {
        manifest: emptyManifest(),
        objectsPresent,
        warning: `mirror manifest is corrupt but no objects exist; starting a fresh inventory (${(err as Error).message})`,
      };
    }
  }

  async upload(
    objects: UploadObject[],
    manifest: MirrorManifest,
    message: string,
  ): Promise<UploadResult> {
    for (const object of objects) {
      const target = join(this.workDir, object.relPath);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(object.sourcePath, target);
    }

    // Idempotent LFS tracking (only touches .gitattributes when needed).
    const attributesPath = join(this.workDir, '.gitattributes');
    let attributes = '';
    try {
      attributes = await readFile(attributesPath, 'utf8');
    } catch {
      attributes = '';
    }
    if (!attributes.includes('objects/**')) {
      const track = await this.git.lfsTrack('objects/**');
      if (track.status !== 0) {
        throw new GitError(`git lfs track failed: ${summarize(track)}`, track);
      }
    }

    await writeFile(join(this.workDir, 'manifest.json'), serializeManifest(manifest), 'utf8');

    const add = await this.git.addAll();
    if (add.status !== 0) {
      throw new GitError(`git add failed: ${summarize(add)}`, add);
    }

    if (!(await this.git.isDirty())) {
      return { commit: await this.git.head(), pushed: false };
    }

    const commit = await this.git.commit(message);
    if (commit.status !== 0) {
      throw new GitError(`git commit failed: ${summarize(commit)}`, commit);
    }

    const branch = (await this.git.currentBranch()) ?? 'main';
    const rebase = await this.git.pullRebase('origin', branch);
    if (rebase.status !== 0) {
      throw new GitError(
        `git pull --rebase failed (re-run push to retry): ${summarize(rebase)}`,
        rebase,
      );
    }

    const push = await this.git.push(`HEAD:refs/heads/${branch}`);
    if (push.status !== 0) {
      throw new GitError(`git push failed (re-run push to retry): ${summarize(push)}`, push);
    }

    return { commit: await this.git.head(), pushed: true };
  }

  async materialize(relPaths: string[]): Promise<string[]> {
    if (relPaths.length === 0) return [];
    const pull = await this.git.lfsPullInclude(relPaths);
    if (pull.status !== 0) {
      throw new GitError(`git lfs pull failed: ${summarize(pull)}`, pull);
    }
    return relPaths.map((relPath) => join(this.workDir, relPath));
  }
}

async function hasWorkingClone(workDir: string): Promise<boolean> {
  try {
    const entries = await readdir(join(workDir, '.git'), { withFileTypes: true });
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function hasObjects(objectsDir: string): Promise<boolean> {
  try {
    const entries = await readdir(objectsDir, { withFileTypes: true });
    return entries.length > 0;
  } catch {
    return false;
  }
}

function summarize(result: { stderr: string; stdout: string; status: number }): string {
  const text = (result.stderr || result.stdout).trim();
  if (text.length === 0) return `exit code ${result.status}`;
  const lines = text.split('\n').slice(-3).join(' | ');
  return lines.length > 300 ? `${lines.slice(0, 300)}…` : lines;
}
