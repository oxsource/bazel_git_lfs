import { describe, expect, it } from 'vitest';
import { isValidNamespace, isValidGitUrl } from '../../src/config/profile';

describe('profile validation', () => {
  it('accepts valid namespaces', () => {
    expect(isValidNamespace('default')).toBe(true);
    expect(isValidNamespace('ci-team')).toBe(true);
    expect(isValidNamespace('dev_env.1')).toBe(true);
  });

  it('rejects invalid namespaces', () => {
    expect(isValidNamespace('')).toBe(false);
    expect(isValidNamespace('has space')).toBe(false);
    expect(isValidNamespace('../evil')).toBe(false);
    expect(isValidNamespace('a/b')).toBe(false);
  });

  it('accepts http(s) urls', () => {
    expect(isValidGitUrl('https://gitlab.example.com/bazel/mirror.git')).toBe(true);
    expect(isValidGitUrl('http://gitlab.example.com/bazel/mirror.git')).toBe(true);
  });

  it('accepts ssh urls', () => {
    expect(isValidGitUrl('git@gitlab.example.com:bazel/mirror.git')).toBe(true);
  });

  it('rejects invalid urls', () => {
    expect(isValidGitUrl('')).toBe(false);
    expect(isValidGitUrl('not-a-url')).toBe(false);
    expect(isValidGitUrl('ftp://example.com/x')).toBe(false);
    expect(isValidGitUrl('@alias')).toBe(false);
  });
});
