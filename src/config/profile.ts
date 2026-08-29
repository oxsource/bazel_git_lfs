export interface Profile {
  namespace: string;
  mirrorRepoUrl: string;
  gitLabHost: string;
  lfsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export const NAMESPACE_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function isValidNamespace(namespace: string): boolean {
  return NAMESPACE_PATTERN.test(namespace);
}

export function isValidGitUrl(url: string): boolean {
  if (!url || url.trim().length === 0) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return isSshGitUrl(url);
  }
}

function isSshGitUrl(url: string): boolean {
  const sshPattern = /^[^@\s]+@[^:\s]+:.+\.git$/;
  return sshPattern.test(url);
}
