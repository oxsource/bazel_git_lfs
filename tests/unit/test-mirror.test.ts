import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createTestMirror, gitLfsAvailable } from '../helpers/test-mirror';

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

      // The commit stores an LFS pointer for the object (not raw bytes);
      // the working-tree file itself keeps its original content.
      const pointer = mirror.git(['show', `HEAD:objects/com/example/abc123`]).stdout;
      expect(pointer).toContain('git-lfs');
      expect(pointer).toContain('oid sha256:');
    } finally {
      mirror.close();
    }
  });

  it('git lfs pull materializes real content in a fresh clone', () => {
    const mirror = createTestMirror();
    try {
      const payload = Buffer.from('roundtrip-payload');
      const payloadSha = createHash('sha256').update(payload).digest('hex');
      mirror.writeWorkFile(`objects/x/y/${payloadSha}`, payload);
      mirror.commitAll('seed');
      mirror.git(['push', 'origin', 'HEAD:refs/heads/main']);

      // A fresh consumer clone (skip smudge on clone, then lfs pull --include).
      const consumer = join(mirror.baseDir, 'consumer');
      execFileSync('git', ['clone', mirror.barePath, 'consumer'], {
        cwd: mirror.baseDir,
        env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' },
        stdio: 'ignore',
      });
      mirror.git(['lfs', 'pull', '--include', `objects/x/y/${payloadSha}`], { cwd: consumer });
      const materialized = readFileSync(join(consumer, `objects/x/y/${payloadSha}`));
      expect(materialized.toString()).toBe('roundtrip-payload');
      expect(createHash('sha256').update(materialized).digest('hex')).toBe(payloadSha);
    } finally {
      mirror.close();
    }
  });
});
