export interface Profile {
  alias: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export const ALIAS_PATTERN = /^[a-zA-Z0-9._-]+$/;

function isValidAlias(alias: string): boolean {
  return ALIAS_PATTERN.test(alias);
}

function isValidGitUrl(url: string): boolean {
  if (!url || url.trim().length === 0) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'file:'
    );
  } catch {
    return isSshGitUrl(url);
  }
}

function hostFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.hostname;
    }
  } catch {
    // fall through to ssh parsing
  }
  const ssh = /^(?:[^@\s]+@)?([^:/]+):/.exec(url);
  if (ssh) {
    return ssh[1];
  }
  return '';
}

function isSshGitUrl(url: string): boolean {
  const sshPattern = /^[^@\s]+@[^:\s]+:.+\.git$/;
  return sshPattern.test(url);
}

export const profile = { isValidAlias, isValidGitUrl, hostFromUrl };
