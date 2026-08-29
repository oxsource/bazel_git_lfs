import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { Readable as ReadableStream } from 'node:stream';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { DIRS } from '@/config/constants';
import { deriveObjectPath } from '@/objects/object-path';
import { sha256 } from '@/objects/sha256';
import type { ObjectRef } from '@/objects/models';

export class HashMismatchError extends Error {
  constructor(
    message: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(message);
    this.name = 'HashMismatchError';
  }
}

export type ObjectContent = Buffer | ReadableStream | AsyncIterable<Buffer>;

export interface ObjectsStoreOptions {
  /** Force overwrite even if a hash-valid object already exists (rarely needed). */
  overwrite?: boolean;
}

/**
 * The local content-addressed objects store at
 * `.bazel_git_lfs/objects/<reversed-host>/<org>/<repo>/<sha256>`.
 *
 * `put` is atomic (stream → temp file → verify → rename); a failed verify
 * deletes the temp and never renames (FR-004). `has` re-verifies the stored
 * content so corrupt entries behave as absent (FR-005). Nothing unverified
 * is ever stored (G1).
 */
export class ObjectsStore {
  private readonly overwrite: boolean;

  constructor(
    public readonly objectsDir: string,
    options: ObjectsStoreOptions = {},
  ) {
    this.overwrite = options.overwrite ?? false;
  }

  static forProject(projectDir: string): ObjectsStore {
    return new ObjectsStore(join(projectDir, CONFIG_DIR_NAME, DIRS.OBJECTS));
  }

  /**
   * Resolve an object address from a primary URL + sha256. Returns a ref
   * even when the file does not exist (use `has`/`put` to work with it).
   * Throws when sha256 is not a valid 64-char hex string.
   */
  pathFor(primaryUrl: string, shaHex: string): ObjectRef {
    if (!sha256.isHex(shaHex)) {
      throw new Error(`invalid sha256 "${shaHex}": expected 64-char lowercase hex`);
    }
    const path = deriveObjectPath(primaryUrl, shaHex);
    const relativePath = `${path.directory}/${shaHex}`;
    return {
      url: primaryUrl,
      sha256: shaHex,
      relativePath,
      absolutePath: join(this.objectsDir, relativePath),
      fallback: path.fallback,
      warning: path.warning,
    };
  }

  /** True when the object exists AND its content matches its sha256. */
  async has(ref: ObjectRef): Promise<boolean> {
    try {
      await stat(ref.absolutePath);
    } catch {
      return false;
    }
    const actual = await sha256.hexOfFile(ref.absolutePath);
    return actual === ref.sha256;
  }

  /** Absolute path when hash-valid, otherwise null (corrupt behaves as absent). */
  async get(ref: ObjectRef): Promise<string | null> {
    return (await this.has(ref)) ? ref.absolutePath : null;
  }

  /**
   * Store content atomically after verifying its SHA256 matches the ref.
   * On mismatch the temp file is removed and HashMismatchError is thrown —
   * the store never holds unverified bytes (G1).
   */
  async put(ref: ObjectRef, content: ObjectContent): Promise<void> {
    const tempPath = `${ref.absolutePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await mkdir(dirname(ref.absolutePath), { recursive: true });
      if (Buffer.isBuffer(content)) {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(tempPath, content);
      } else {
        const source = isReadable(content) ? content : iterableToReadable(content);
        await pipeline(source, createWriteStream(tempPath));
      }
      const actual = await sha256.hexOfFile(tempPath);
      if (actual !== ref.sha256) {
        throw new HashMismatchError(
          `object content does not match declared sha256 (expected ${ref.sha256}, got ${actual})`,
          ref.sha256,
          actual,
        );
      }
      if (!this.overwrite && (await this.has(ref))) {
        // Already present and valid — drop the temp duplicate.
        await rm(tempPath, { force: true });
        return;
      }
      await rename(tempPath, ref.absolutePath);
    } catch (err) {
      await rm(tempPath, { force: true });
      throw err;
    }
  }

  /** Atomic put from an existing (already materialized) file, e.g. after pull. */
  async putFromFile(ref: ObjectRef, sourcePath: string): Promise<void> {
    await this.put(ref, createReadStream(sourcePath));
  }

  /**
   * Re-verify an existing object; returns the mismatch kind:
   * 'absent' | 'hash-mismatch' | null (present and valid).
   */
  async corruptReason(ref: ObjectRef): Promise<'absent' | 'hash-mismatch' | null> {
    let content: Buffer;
    try {
      content = await readFile(ref.absolutePath);
    } catch {
      return 'absent';
    }
    return sha256.hexOfBuffer(content) === ref.sha256 ? null : 'hash-mismatch';
  }

  /** Number of object files currently in the store (any depth). */
  async size(): Promise<number> {
    return countFiles(this.objectsDir);
  }
}

function isReadable(value: ObjectContent): value is ReadableStream {
  return typeof (value as ReadableStream).read === 'function';
}

function iterableToReadable(iterable: AsyncIterable<Buffer>): ReadableStream {
  return Readable.from(iterable);
}

async function countFiles(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countFiles(join(dir, entry.name));
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}
