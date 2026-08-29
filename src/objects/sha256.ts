import { createHash, type Hash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';

/** Compute the SHA256 hex digest of a file's contents (streaming). */
export function sha256HexOfFile(filePath: string): Promise<string> {
  return sha256HexOfStream(createReadStream(filePath));
}

/** Compute the SHA256 hex digest of a readable stream (streaming). */
export async function sha256HexOfStream(stream: Readable): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

/** Compute the SHA256 hex digest of an in-memory buffer. */
export function sha256HexOfBuffer(data: Buffer): string {
  const hash: Hash = createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

/** True when `value` is a 64-char lowercase hex SHA256 string. */
export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
