import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createTestMirror, gitLfsAvailable } from '../helpers/test-mirror';

const ALPHA_SHA = '15a019bdffa8f446afa81fe49b132cde0ce178a62978e5f885f5ae9be094ad07';
const lfs = gitLfsAvailable();

describe.skipIf(!lfs)('test-mirror helper (requires git-lfs)', () => {
  it('creates a bare repo with an LFS-tracked working clone', () => {
    const mirror = createTestMirror();
    try {
      expect(mirror.git(['rev-parse', '--is-bare-repository']).stdout.trim()).toBe('false');

      // Seed an object through the working clone, then push.
      mirror.writeWorkFile('objects/com/example/abc123', 'hello-lfs');
      mirror.commitAll('add object');
      const push = mirror.git(['push', 'origin', 'HEAD:refs/heads/main']);
      expect(push.status).toBe(0);

      // The working clone stores an LFS pointer for the object (not raw bytes).
      const ls = mirror.git(['ls-tree', '-r', 'HEAD', '--name-only']).stdout;
      expect(ls).toContain('objects/com/example/abc123');
      expect(mirror.readWorkFile('objects/com/example/abc123')).toContain('git-lfs');
    } finally {
      mirror.close();
    }
  });

  it('git lfs pull materializes real content in a fresh clone', () => {
    const mirror = createTestMirror();
    try {
      const payload = Buffer.from('roundtrip-payload');
      mirror.writeWorkFile(`objects/x/y/${ALPHA_SHA}`, payload);
      mirror.commitAll('seed');
      mirror.git(['push', 'origin', 'HEAD:refs/heads/main']);

      // A fresh consumer clone (skip smudge on clone, then lfs pull --include).
      const consumer = join(mirror.baseDir, 'consumer');
      execFileSync('git', ['clone', mirror.barePath, 'consumer'], {
        cwd: mirror.baseDir,
        env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' },
        stdio: 'ignore',
      });
      mirror.git(['lfs', 'pull', '--include', `objects/x/y/${ALPHA_SHA}`], { cwd: consumer });
      const materialized = readFileSync(join(consumer, `objects/x/y/${ALPHA_SHA}`));
      expect(materialized.toString()).toBe('roundtrip-payload');
      expect(createHash('sha256').update(materialized).digest('hex')).toBe(ALPHA_SHA);
    } finally {
      mirror.close();
    }
  });
});
