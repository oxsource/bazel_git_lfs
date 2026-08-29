import { describe, expect, it } from 'vitest';
import { profile } from '@/config/profile';

describe('profile validation', () => {
  it('accepts valid aliases', () => {
    expect(profile.isValidAlias('default')).toBe(true);
    expect(profile.isValidAlias('ci-team')).toBe(true);
    expect(profile.isValidAlias('dev_env.1')).toBe(true);
  });

  it('rejects invalid aliases', () => {
    expect(profile.isValidAlias('')).toBe(false);
    expect(profile.isValidAlias('has space')).toBe(false);
    expect(profile.isValidAlias('../evil')).toBe(false);
    expect(profile.isValidAlias('a/b')).toBe(false);
  });

  it('accepts http(s) urls', () => {
    expect(profile.isValidGitUrl('https://gitlab.example.com/bazel/mirror.git')).toBe(true);
    expect(profile.isValidGitUrl('http://gitlab.example.com/bazel/mirror.git')).toBe(true);
  });

  it('accepts ssh urls', () => {
    expect(profile.isValidGitUrl('git@gitlab.example.com:bazel/mirror.git')).toBe(true);
  });

  it('rejects invalid urls', () => {
    expect(profile.isValidGitUrl('')).toBe(false);
    expect(profile.isValidGitUrl('not-a-url')).toBe(false);
    expect(profile.isValidGitUrl('ftp://example.com/x')).toBe(false);
    expect(profile.isValidGitUrl('@alias')).toBe(false);
  });

  it('derives host from http(s) urls', () => {
    expect(profile.hostFromUrl('https://gitlab.example.com/bazel/mirror.git')).toBe('gitlab.example.com');
    expect(profile.hostFromUrl('http://gitlab.example.com/m.git')).toBe('gitlab.example.com');
  });

  it('derives host from ssh urls', () => {
    expect(profile.hostFromUrl('git@gitlab.example.com:bazel/mirror.git')).toBe('gitlab.example.com');
  });
});
