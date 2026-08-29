import { Readable } from 'node:stream';
import { ObjectsStore, HashMismatchError } from '@/objects/store';
import { isSha256Hex } from '@/objects/sha256';
import type { ObjectRef } from '@/objects/models';

export interface DownloadAttempt {
  url: string;
  error: string;
}

export interface DownloadSuccess {
  status: 'fetched';
}

export interface DownloadFailure {
  status: 'failed';
  reason: 'missing-sha256' | 'network' | 'hash-mismatch' | 'no-url-succeeded';
  message: string;
  attempts: DownloadAttempt[];
}

export type DownloadOutcome = DownloadSuccess | DownloadFailure;

export interface DownloadOptions {
  /** Per-URL request timeout in ms (default 10 minutes). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60_000;

/**
 * Download a dependency from its declared URLs (tried in order) and store
 * it into the objects store — verified before anything is persisted (G1).
 *
 * Failure classification (research decision 2 / contracts/cli.md):
 * - missing-sha256: rejected up front, no request is made;
 * - hash-mismatch: every URL delivered bytes but none matched the digest;
 * - network: every URL failed before a hash could be computed;
 * - no-url-succeeded: mixed failures across attempts.
 */
export async function downloadAndStore(
  store: ObjectsStore,
  urls: string[],
  ref: ObjectRef,
  options: DownloadOptions = {},
): Promise<DownloadOutcome> {
  if (!isSha256Hex(ref.sha256)) {
    return {
      status: 'failed',
      reason: 'missing-sha256',
      message: `dependency has no declared sha256; refusing to download/store unverified content`,
      attempts: [],
    };
  }
  if (urls.length === 0) {
    return {
      status: 'failed',
      reason: 'no-url-succeeded',
      message: 'dependency declares no source URLs',
      attempts: [],
    };
  }

  const attempts: DownloadAttempt[] = [];
  let sawHashMismatch = false;
  let sawNetworkError = false;

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (!response.ok) {
        attempts.push({ url, error: `HTTP ${response.status}` });
        sawNetworkError = true;
        continue;
      }
      if (!response.body) {
        attempts.push({ url, error: 'empty response body' });
        sawNetworkError = true;
        continue;
      }
      const stream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
      await store.put(ref, stream);
      return { status: 'fetched' };
    } catch (err) {
      if (err instanceof HashMismatchError) {
        sawHashMismatch = true;
        attempts.push({ url, error: err.message });
        continue;
      }
      sawNetworkError = true;
      attempts.push({
        url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Pure-failure classification: all attempts hash-mismatched →
  // hash-mismatch; all transport errors → network; anything mixed →
  // no-url-succeeded.
  const reason: 'network' | 'hash-mismatch' | 'no-url-succeeded' =
    sawHashMismatch && !sawNetworkError
      ? 'hash-mismatch'
      : sawNetworkError && !sawHashMismatch
        ? 'network'
        : 'no-url-succeeded';
  return {
    status: 'failed',
    reason,
    message: `all ${urls.length} source URL(s) failed`,
    attempts,
  };
}
