export function suggestBranchPattern(group: string, repo: string): string {
  return `${group}/${repo}`;
}

export function formatBranchSuggestion(group: string, repo: string): string {
  const pattern = suggestBranchPattern(group, repo);
  return `Suggested branch: ${pattern}`;
}

export function suggestBranchName(group: string, repo: string): string {
  return `${group}/${repo}`;
}