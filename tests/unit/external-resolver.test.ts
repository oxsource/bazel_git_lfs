import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

function createFakeOutputBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'bgl-test-outputbase-'));
  mkdirSync(join(base, 'external', 'B'), { recursive: true });
  writeFileSync(join(base, 'external', 'B', 'deps.bzl'), 'def setup_b(): pass');
  return base;
}

describe('ExternalResolver sandbox', () => {
  it('resolves via sandbox exact match', async () => {
    const outputBase = createFakeOutputBase();
    const projectDir = mkdtempSync(join(tmpdir(), 'bgl-test-project-'));
    const { execFile } = await import('node:child_process');
    (execFile as ReturnType<typeof vi.fn>).mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string }) => void) => {
        if (cb) cb(null, { stdout: outputBase + '\n' });
        return {} as ReturnType<typeof execFile>;
      },
    );

    const { ExternalResolver } = await import('@/inspect/external-resolver');
    const resolver = new ExternalResolver(projectDir);

    const result = await resolver.resolve('B');
    expect(result.status).toBe('sandbox');
    expect(result.rootDir).toBe(join(outputBase, 'external', 'B'));
    expect(result.temp).toBe(false);

    // Cache hit.
    const cached = await resolver.resolve('B');
    expect(cached).toBe(result);
    await resolver.cleanup();
  });

  it('resolves via Bzlmod tolerant match', async () => {
    const outputBase = mkdtempSync(join(tmpdir(), 'bgl-test-bzlmod-'));
    mkdirSync(join(outputBase, 'external', 'B~1.0'), { recursive: true });
    writeFileSync(join(outputBase, 'external', 'B~1.0', 'deps.bzl'), 'def setup_b(): pass');

    const projectDir = mkdtempSync(join(tmpdir(), 'bgl-test-project-'));
    const { execFile } = await import('node:child_process');
    (execFile as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string }) => void) => {
          if (cb) cb(null, { stdout: outputBase + '\n' });
          return {} as ReturnType<typeof execFile>;
        },
      );

    const { ExternalResolver } = await import('@/inspect/external-resolver');
    const resolver = new ExternalResolver(projectDir);
    const result = await resolver.resolve('B');
    expect(result.status).toBe('sandbox');
    expect(result.rootDir).toBe(join(outputBase, 'external', 'B~1.0'));
    await resolver.cleanup();
  });

  it('returns unresolved when no sandbox and no sourceDep', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'bgl-test-nosandbox-'));
    const { execFile } = await import('node:child_process');
    (execFile as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null) => void) => {
          if (cb) cb(new Error('bazel not found'));
          return {} as ReturnType<typeof execFile>;
        },
      );

    const { ExternalResolver } = await import('@/inspect/external-resolver');
    const resolver = new ExternalResolver(projectDir);
    const result = await resolver.resolve('nonexistent');
    expect(result.status).toBe('unresolved');
    expect(result.rootDir).toBeNull();
    await resolver.cleanup();
  });
});