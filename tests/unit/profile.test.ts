import { describe, expect, it } from 'vitest';
import { isValidAlias, isValidGitUrl, hostFromUrl } from '@/config/profile';

describe('profile validation', () => {
  it('accepts valid aliases', () => {
    expect(isValidAlias('default')).toBe(true);
    expect(isValidAlias('ci-team')).toBe(true);
    expect(isValidAlias('dev_env.1')).toBe(true);
  });

  it('rejects invalid aliases', () => {
    expect(isValidAlias('')).toBe(false);
    expect(isValidAlias('has space')).toBe(false);
    expect(isValidAlias('../evil')).toBe(false);
    expect(isValidAlias('a/b')).toBe(false);
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

  it('derives host from http(s) urls', () => {
    expect(hostFromUrl('https://gitlab.example.com/bazel/mirror.git')).toBe('gitlab.example.com');
    expect(hostFromUrl('http://gitlab.example.com/m.git')).toBe('gitlab.example.com');
  });

  it('derives host from ssh urls', () => {
    expect(hostFromUrl('git@gitlab.example.com:bazel/mirror.git')).toBe('gitlab.example.com');
  });
});
