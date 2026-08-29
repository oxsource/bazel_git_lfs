import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export const PATCH_MARKER = '# bazel-git-lfs:checkout';
export const PATCHES_DIR = 'patches';

/**
 * Generate a minimal unified diff between original and rewritten bzl content.
 */
export function generatePatch(
  originalContent: string,
  rewrittenContent: string,
  contextLines = 0,
): string {
  if (originalContent === rewrittenContent) return '';

  const origLines = originalContent.split('\n');
  const newLines = rewrittenContent.split('\n');
  const hunks: string[] = [];
  let hunkStart = -1;

  for (let i = 0; i < Math.max(origLines.length, newLines.length); i++) {
    const orig = origLines[i] ?? '';
    const nw = newLines[i] ?? '';
    if (orig !== nw) {
      if (hunkStart < 0) hunkStart = Math.max(0, i - contextLines);
      continue;
    }
    if (hunkStart >= 0) {
      hunks.push(buildHunk(origLines, newLines, hunkStart, i, contextLines));
      hunkStart = -1;
    }
  }
  if (hunkStart >= 0) {
    hunks.push(buildHunk(origLines, newLines, hunkStart, Math.max(origLines.length, newLines.length), contextLines));
  }

  return hunks.join('\n');
}

function buildHunk(
  origLines: string[],
  newLines: string[],
  start: number,
  end: number,
  contextLines: number,
): string {
  const ctx = Math.min(contextLines, start);
  const hunkStartLine = start - ctx + 1;
  const hunkOrigEnd = Math.min(end + contextLines, origLines.length);
  const hunkNewEnd = Math.min(end + contextLines, newLines.length);

  const header = `@@ -${hunkStartLine},${hunkOrigEnd - hunkStartLine + 1} +${hunkStartLine},${hunkNewEnd - hunkStartLine + 1} @@`;
  const body: string[] = [];

  for (let i = start - ctx; i < hunkOrigEnd; i++) {
    if (i < end && i >= start) {
      body.push(`-${origLines[i] ?? ''}`);
      body.push(`+${newLines[i] ?? ''}`);
    } else {
      body.push(` ${origLines[i] ?? ''}`);
    }
  }

  return header + '\n' + body.join('\n');
}

export interface PatchCommand {
  repo: string;
  pathInsideRepo: string;
  oldUrls: string[];
  newUrl: string;
}

/**
 * Build a shell command string for patch_cmds, starting with a marker comment.
 * POSIX-safe: sed inline via redirect+move (no -i dialect issues).
 */
export function buildPatchCommand(cmd: PatchCommand): string {
  const sedCommands = cmd.oldUrls.map((old) =>
    `sed 's|${escapeSed(old)}|${escapeSed(cmd.newUrl)}|g' ${cmd.pathInsideRepo} > ${cmd.pathInsideRepo}.bgl_tmp && mv ${cmd.pathInsideRepo}.bgl_tmp ${cmd.pathInsideRepo}`
  );
  return `# bazel-git-lfs:checkout ${cmd.repo}\n    ${sedCommands.join(' && \\\n    ')}`;
}

export function isMarkerLine(line: string): boolean {
  return line.includes(PATCH_MARKER);
}

function escapeSed(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/&/g, '\\&');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Inject a marker-tagged patch_cmds entry into an http_archive declaration.
 * The attribute is added as a list of strings: patch_cmds = ["..."].
 * Idempotent: replaces existing marker commands for the same repo.
 * Uses regex-based block finding for robustness.
 */
export function injectPatchCmds(
  entryContent: string,
  repo: string,
  patchCmd: string,
): string {
  // Find the http_archive block for the given repo.
  const blockRegex = new RegExp(
    `(http_archive\\s*\\([^)]*?name\\s*=\\s*"${escapeRegex(repo)}"[^)]*\\))`,
    's',
  );
  const blockMatch = blockRegex.exec(entryContent);
  if (!blockMatch) return entryContent;

  const fullBlock = blockMatch[0];
  const blockStart = blockMatch.index;
  const blockEnd = blockStart + fullBlock.length;

  // Check if the block has a patch_cmds attribute.
  const cmdsRegex = /patch_cmds\s*=\s*\[([\s\S]*?)\]/;
  const cmdsMatch = cmdsRegex.exec(fullBlock);

  if (cmdsMatch) {
    const cmdsContent = cmdsMatch[1];
    const cmdsStart = blockStart + cmdsMatch.index;
    const cmdsEnd = cmdsStart + cmdsMatch[0].length;

    // Check if the marker exists in the patch_cmds list.
    const markerRegex = new RegExp(`${escapeRegex(PATCH_MARKER)}\\s+${escapeRegex(repo)}`);
    if (markerRegex.test(cmdsContent)) {
      // Replace the marker line in the list.
      const beforeContent = entryContent.slice(0, cmdsStart);
      const afterContent = entryContent.slice(cmdsEnd);
      const newCmdsContent = cmdsContent.replace(
        /"[^"]*"[,\s]*/,
        `        "${patchCmd}",\n    `,
      );
      return beforeContent + `patch_cmds = [\n${newCmdsContent}]` + afterContent;
    } else {
      // Append a new element before the closing ].
      const beforeContent = entryContent.slice(0, cmdsEnd - 1);
      const afterContent = entryContent.slice(cmdsEnd - 1);
      return beforeContent + `\n        "${patchCmd}",\n    ]` + afterContent;
    }
  }

  // No existing patch_cmds — add one before the closing paren.
  const beforeClose = entryContent.slice(0, blockEnd - 1);
  const afterClose = entryContent.slice(blockEnd - 1);
  return beforeClose + `\n    patch_cmds = [\n        "${patchCmd}",\n    ],\n` + afterClose;
}

/**
 * Remove all marker-tagged patch_cmds entries from entry content.
 * If the patch_cmds list becomes empty after removal, the attribute is removed entirely.
 */
export function removePatchCmds(entryContent: string): string {
  // Find a patch_cmds attribute that contains our marker and remove the entire attribute.
  const markerPattern = new RegExp(
    `\\n\\s*patch_cmds\\s*=\\s*\\[[\\s\\S]*?${escapeRegex(PATCH_MARKER)}[\\s\\S]*?\\]`,
    'g',
  );
  return entryContent.replace(markerPattern, '');
}

/**
 * Write an audit patch file to the patches directory.
 */
export async function writeAuditPatch(
  projectDir: string,
  repo: string,
  patchContent: string,
): Promise<string> {
  const patchesDir = join(projectDir, CONFIG_DIR_NAME, PATCHES_DIR);
  await mkdir(patchesDir, { recursive: true });
  const patchFile = join(patchesDir, `${repo}.patch`);
  await writeFile(patchFile, patchContent, 'utf8');
  return `patches/${repo}.patch`;
}

/**
 * Delete an audit patch file.
 */
export async function deleteAuditPatch(
  projectDir: string,
  patchPath: string,
): Promise<void> {
  const absPath = join(projectDir, CONFIG_DIR_NAME, patchPath);
  if (existsSync(absPath)) {
    await rm(absPath, { force: true });
  }
}

const CONFIG_DIR_NAME = '.bazel_git_lfs';