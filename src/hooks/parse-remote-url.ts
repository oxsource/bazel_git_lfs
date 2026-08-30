export interface ParsedRemoteUrl {
  host: string;
  group: string;
  repo: string;
}

export function parseRemoteUrl(url: string): ParsedRemoteUrl | null {
  let host = '';
  let path = '';

  if (url.startsWith('git@')) {
    // SSH: git@host:group/repo.git
    const colonIdx = url.indexOf(':');
    if (colonIdx === -1) return null;
    host = url.slice(4, colonIdx);
    path = url.slice(colonIdx + 1);
  } else if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('git://')) {
    // HTTPS/Git: https://host/group/repo.git
    const parts = url.split('/');
    if (parts.length < 5) return null;
    host = parts[2];
    path = parts.slice(3).join('/');
  } else if (url.startsWith('file://')) {
    return null;
  } else {
    return null;
  }

  path = path.replace(/\.git$/, '');
  const slashIdx = path.indexOf('/');
  if (slashIdx === -1) return null;

  const group = path.slice(0, slashIdx);
  const repo = path.slice(slashIdx + 1);
  if (!host || !group || !repo) return null;

  return { host, group, repo };
}
