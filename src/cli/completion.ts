export interface CompletionOptions {
  shell?: string;
}

function bashCompletion(name: string): string {
  return [
    `_${name}() {`,
    '  local cur prev words cword',
    '  _init_completion || return',
    '',
    '  local custom_commands="init inspect clean checkout completion"',
    '  local passthrough_commands="fetch push pull remote status log branch add commit diff show config tag stash rebase merge reset restore rm mv"',
    '',
    '  case $prev in',
    `    ${name})`,
    '      COMPREPLY=($(compgen -W "$custom_commands $passthrough_commands --help --version" -- "$cur"))',
    '      ;;',
    '    init)',
    '      COMPREPLY=($(compgen -W "--json" -- "$cur"))',
    '      ;;',
    '    inspect)',
    '      COMPREPLY=($(compgen -W "-f --force -u --update --json" -- "$cur"))',
    '      ;;',
    '    clean)',
    '      COMPREPLY=($(compgen -W "" -- "$cur"))',
    '      ;;',
    '    checkout)',
    '      if [[ -d .bazel_git_lfs/objects ]]; then',
    '        local branches=$(git -C .bazel_git_lfs/objects branch --format="%(refname:short)" 2>/dev/null)',
    '        COMPREPLY=($(compgen -W "-- @ default local $branches" -- "$cur"))',
    '      else',
    '        COMPREPLY=($(compgen -W "-- @ default local" -- "$cur"))',
    '      fi',
    '      ;;',
    '    completion)',
    '      COMPREPLY=($(compgen -W "bash zsh" -- "$cur"))',
    '      ;;',
    '    fetch|push|pull)',
    '      if [[ -d .bazel_git_lfs/objects ]]; then',
    '        local remotes=$(git -C .bazel_git_lfs/objects remote 2>/dev/null)',
    '        COMPREPLY=($(compgen -W "$remotes" -- "$cur"))',
    '      fi',
    '      ;;',
    '    *)',
    '      if [[ "$cur" == -* ]]; then',
    '        COMPREPLY=($(compgen -W "--help" -- "$cur"))',
    '      fi',
    '      ;;',
    '  esac',
    '} &&',
    `complete -F _${name} ${name}`,
    '',
  ].join('\n');
}

function zshCompletion(name: string): string {
  const lines = [
    '#compdef ' + name,
    '',
    'local -a custom_commands passthrough_commands',
    '',
    'custom_commands=(',
    '  "init:Initialize config area and inner git repo"',
    '  "inspect:Scan Bazel dependencies"',
    '  "clean:Remove .bazel_git_lfs directory"',
    '  "checkout:Switch dependency URLs"',
    '  "completion:Generate shell completion"',
    ')',
    '',
    'passthrough_commands=(',
    '  "fetch:Fetch from remote"',
    '  "push:Push to remote"',
    '  "pull:Pull from remote"',
    '  "remote:Manage remotes"',
    '  "status:Show status"',
    '  "log:Show log"',
    '  "branch:Manage branches"',
    '  "add:Add files"',
    '  "commit:Commit changes"',
    ')',
    '',
    '_arguments \\',
    '  "(-V --version)"{-V,--version}"[Show version]" \\',
    '  "(-h --help)"{-h,--help}"[Show help]" \\',
    '  "*::command:->command"',
    '',
    'case $state in',
    '  command)',
    '    _describe -t commands commands custom_commands',
    '    _describe -t passthrough passthrough passthrough_commands',
    '    ;;',
    'esac',
    '',
    'case $words[1] in',
    '  init)',
    '    _arguments "--json[Output JSON]"',
    '    ;;',
    '  inspect)',
    '    _arguments \\',
    '      "(-f --force)"{-f,--force}"[Force re-scan]" \\',
    '      "(-u --update)"{-u,--update}"[Download missing]" \\',
    '      "--json[Output JSON]"',
    '    ;;',
    '  checkout)',
    '    if [[ -d .bazel_git_lfs/objects ]]; then',
    '      local branches="${(f)$(git -C .bazel_git_lfs/objects branch --format=\'%(refname:short)\' 2>/dev/null)}"',
    '      _arguments \\',
    '        "--[Restore original URLs]" \\',
    '        "@[Switch to local paths]" \\',
    '        "*:branch:($branches)"',
    '    else',
    '      _arguments \\',
    '        "--[Restore original URLs]" \\',
    '        "@[Switch to local paths]"',
    '    fi',
    '    ;;',
    '  completion)',
    '    _arguments "::shell:(bash zsh)"',
    '    ;;',
    '  fetch|push|pull)',
    '    if [[ -d .bazel_git_lfs/objects ]]; then',
    '      local remotes="${(f)$(git -C .bazel_git_lfs/objects remote 2>/dev/null)}"',
    '      _arguments "*:remote:($remotes)"',
    '    fi',
    '    ;;',
    'esac',
    '',
  ];
  return lines.join('\n');
}

export function generateCompletion(shell: string, toolName: string): string {
  switch (shell) {
    case 'bash':
      return bashCompletion(toolName);
    case 'zsh':
      return zshCompletion(toolName);
    default:
      return bashCompletion(toolName);
  }
}

export async function runCompletion(opts: CompletionOptions): Promise<number> {
  const shell = opts.shell ?? (process.env.SHELL?.includes('zsh') ? 'zsh' : 'bash');
  process.stdout.write(generateCompletion(shell, 'bazel-git-lfs'));
  return 0;
}