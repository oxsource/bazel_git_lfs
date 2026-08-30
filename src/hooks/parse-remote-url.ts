export interface ParsedRemoteUrl {
  group: string;
  repo: string;
}

export function parseRemoteUrl(url: string): ParsedRemoteUrl | null {
  let path = '';

  if (url.startsWith('git@')) {
    const colonIdx = url.indexOf(':');
    if (colonIdx === -1) return null;
    path = url.slice(colonIdx + 1);
  } else if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('git://')) {
    const parts = url.split('/');
    if (parts.length < 4) return null;
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
  if (!group || !repo) return null;

  return { group, repo };
}