import { describe, expect, it } from 'vitest';
import { generatePatch, buildPatchCommand, injectPatchCmds, removePatchCmds, isMarkerLine } from '@/mirror/patch';

describe('generatePatch', () => {
  it('returns empty string when content is unchanged', () => {
    const content = 'http_archive(name = "x", urls = ["https://old"])';
    expect(generatePatch(content, content)).toBe('');
  });

  it('generates a unified diff for a single URL change', () => {
    const orig = 'http_archive(\n    name = "x",\n    urls = ["https://old"],\n)';
    const rewritten = 'http_archive(\n    name = "x",\n    urls = ["https://new"],\n)';
    const patch = generatePatch(orig, rewritten);
    expect(patch).toContain('@@');
    expect(patch).toContain('-    urls = ["https://old"]');
    expect(patch).toContain('+    urls = ["https://new"]');
  });

  it('handles multiple changed lines', () => {
    const orig = 'http_archive(\n    name = "a",\n    urls = ["https://old1"],\n)\nhttp_archive(\n    name = "b",\n    urls = ["https://old2"],\n)';
    const rewritten = 'http_archive(\n    name = "a",\n    urls = ["https://new1"],\n)\nhttp_archive(\n    name = "b",\n    urls = ["https://new2"],\n)';
    const patch = generatePatch(orig, rewritten, 1);
    expect(patch).toContain('https://new1');
    expect(patch).toContain('https://new2');
  });
});

describe('buildPatchCommand', () => {
  it('generates a marker-tagged shell command', () => {
    const cmd = buildPatchCommand({
      repo: 'B',
      pathInsideRepo: 'deps.bzl',
      oldUrls: ['https://old.com/a.tar.gz'],
      newUrl: 'https://new.com/a.tar.gz',
    });
    expect(cmd).toContain('# bazel-git-lfs:checkout B');
    expect(cmd).toContain('deps.bzl');
    expect(cmd).toContain('sed');
    expect(cmd).toContain('https://old.com/a.tar.gz');
    expect(cmd).toContain('https://new.com/a.tar.gz');
  });
});

describe('injectPatchCmds', () => {
  it('adds a patch_cmds attribute to the correct http_archive block', () => {
    const entry = `http_archive(
    name = "B",
    urls = ["https://old"],
    sha256 = "abc",
)`;
    const cmd = buildPatchCommand({
      repo: 'B', pathInsideRepo: 'deps.bzl',
      oldUrls: ['https://old'], newUrl: 'https://new',
    });
    const result = injectPatchCmds(entry, 'B', cmd);
    expect(result).toContain('patch_cmds');
    expect(result).toContain('# bazel-git-lfs:checkout B');
    expect(result).toContain('https://new');
  });

  it('replaces existing marker commands (idempotent)', () => {
    const entry = `http_archive(
    name = "B",
    urls = ["https://old"],
    sha256 = "abc",
)`;
    const cmd1 = buildPatchCommand({
      repo: 'B', pathInsideRepo: 'deps.bzl',
      oldUrls: ['https://old'], newUrl: 'https://v1',
    });
    const cmd2 = buildPatchCommand({
      repo: 'B', pathInsideRepo: 'deps.bzl',
      oldUrls: ['https://old'], newUrl: 'https://v2',
    });

    const first = injectPatchCmds(entry, 'B', cmd1);
    expect(first).toContain('https://v1');

    const second = injectPatchCmds(first, 'B', cmd2);
    expect(second).toContain('https://v2');
    // Should not contain v1 anymore.
    expect(second).not.toContain('https://v1');
    // Marker should appear exactly once.
    expect(second.split('# bazel-git-lfs:checkout B').length - 1).toBe(1);
  });
});

describe('removePatchCmds', () => {
  it('removes marker-tagged commands', () => {
    const withPatch = `http_archive(
    name = "B",
    urls = ["https://old"],
    patch_cmds = [
        "# bazel-git-lfs:checkout B\\nsed 's|https://old|https://new|g' deps.bzl > deps.bzl.bgl_tmp && mv deps.bzl.bgl_tmp deps.bzl",
    ],
)`;
    const result = removePatchCmds(withPatch);
    expect(result).not.toContain('bazel-git-lfs:checkout');
    expect(result).not.toContain('patch_cmds');
    expect(result).toContain('name = "B"');
  });

  it('leaves unmodified content unchanged', () => {
    const clean = `http_archive(name = "B", urls = ["https://old"])`;
    expect(removePatchCmds(clean)).toBe(clean);
  });
});

describe('isMarkerLine', () => {
  it('detects marker lines', () => {
    expect(isMarkerLine('# bazel-git-lfs:checkout B')).toBe(true);
    expect(isMarkerLine('  # bazel-git-lfs:checkout X  ')).toBe(true);
    expect(isMarkerLine('name = "B"')).toBe(false);
    expect(isMarkerLine('')).toBe(false);
  });
});