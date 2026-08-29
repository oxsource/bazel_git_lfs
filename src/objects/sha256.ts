import { createHash, type Hash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';

async function hexOfStream(stream: Readable): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

function hexOfBuffer(data: Buffer): string {
  const hash: Hash = createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

function hexOfFile(filePath: string): Promise<string> {
  return hexOfStream(createReadStream(filePath));
}

function isHex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

export const sha256 = { hexOfFile, hexOfStream, hexOfBuffer, isHex };