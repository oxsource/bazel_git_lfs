export function suggestBranchPattern(group: string, repo: string): string {
  return `${group}_${repo}_<feature>`;
}

export function formatBranchSuggestion(group: string, repo: string): string {
  const pattern = suggestBranchPattern(group, repo);
  return `Suggested branch format: ${pattern}`;
}

export function suggestBranchName(group: string, repo: string): string {
  return `${group}_${repo}_feature`;
}