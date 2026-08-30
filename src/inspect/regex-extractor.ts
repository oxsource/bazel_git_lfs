import { Dependency } from './models';

/**
 * A generic regex-based dependency extractor used as a fallback for complex
 * .bzl syntax (dict-driven declaration lists, wrapper functions, for loops,
 * etc.) that the structural parser cannot always handle. It scans the raw
 * source for name/url(s)/sha256 literals inside `{...}` dict blocks and
 * `http_archive(...)`/`http_file(...)` call blocks — without trying to
 * understand the surrounding grammar — so it works across any project.
 */

interface RawDependency {
  name?: string;
  url?: string;
  urls?: string[];
  sha256?: string;
  stripPrefix?: string;
}

const DIRECT_RULES = ['http_archive', 'http_file'];

function extractKeyValue(block: string, key: string): string | null {
  const re = new RegExp(
    `["']?${key}["']?\\s*[:=]\\s*["']([^"']+)["']`,
  );
  const m = block.match(re);
  return m ? m[1] : null;
}

function extractUrls(block: string): string[] | null {
  // urls = ["a", "b"] / urls: ["a", "b"]
  const listRe = /["']?urls["']?\s*[:=]\s*\[([^\]]*)\]/;
  const listMatch = block.match(listRe);
  if (listMatch) {
    const urls = [...listMatch[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
    if (urls.length > 0) return urls;
  }
  // single url = "..." / url: "..."
  const single = extractKeyValue(block, 'url');
  return single ? [single] : null;
}

function parseDictBlock(block: string): RawDependency | null {
  const name = extractKeyValue(block, 'name');
  const urls = extractUrls(block);
  if (!name || !urls) return null;
  return {
    name,
    urls,
    sha256: extractKeyValue(block, 'sha256') ?? undefined,
    stripPrefix: extractKeyValue(block, 'strip_prefix') ?? undefined,
  };
}

/**
 * Split source into balanced `{...}` and `NAME(...)` blocks so each block can
 * be regex-scanned independently.
 */
function extractBlocks(content: string): string[] {
  const blocks: string[] = [];
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (ch === '{' || ch === '(') {
      // For `(` blocks, include the trailing identifier (e.g. `http_archive(`)
      // so rule calls are recognizable as NAME(...).
      const open = ch;
      let start = i;
      if (open === '(') {
        let j = i - 1;
        while (j >= 0 && /\s/.test(content[j])) j--;
        let end = j;
        while (end >= 0 && /[a-zA-Z0-9_]/.test(content[end])) end--;
        if (end < j) start = end + 1;
      }
      const close = open === '{' ? '}' : ')';
      let depth = 1;
      let inString: string | null = null;
      i++;
      while (i < content.length && depth > 0) {
        const c = content[i];
        if (inString) {
          if (c === '\\') {
            i += 2;
          } else {
            if (c === inString) inString = null;
            i++;
          }
          continue;
        }
        if (c === '"' || c === "'") {
          inString = c;
          i++;
          continue;
        }
        if (c === open) depth++;
        else if (c === close) depth--;
        i++;
      }
      blocks.push(content.slice(start, i));
    } else {
      i++;
    }
  }
  return blocks;
}

function isDirectCallBlock(block: string): boolean {
  const name = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(block.trim());
  return !!name && DIRECT_RULES.includes(name[1]);
}

function parseCallBlock(block: string): RawDependency | null {
  const name = extractKeyValue(block, 'name');
  const urls = extractUrls(block);
  if (!name || !urls) return null;
  return {
    name,
    urls,
    sha256: extractKeyValue(block, 'sha256') ?? undefined,
    stripPrefix: extractKeyValue(block, 'strip_prefix') ?? undefined,
  };
}

export function extractDepsByRegex(content: string): Dependency[] {
  const blocks = extractBlocks(content);
  const raw: RawDependency[] = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed.startsWith('{')) {
      const dep = parseDictBlock(block);
      if (dep) raw.push(dep);
    } else if (isDirectCallBlock(block)) {
      const dep = parseCallBlock(block);
      if (dep) raw.push(dep);
    }
  }

  // Deduplicate by name (first occurrence wins).
  const seen = new Set<string>();
  const result: Dependency[] = [];
  for (const dep of raw) {
    if (!dep.name) continue;
    if (seen.has(dep.name)) continue;
    seen.add(dep.name);
    result.push({
      name: dep.name,
      urls: dep.urls ?? [],
      sha256: dep.sha256 ?? null,
      stripPrefix: dep.stripPrefix ?? null,
      sourceFile: '',
      resolved: true,
    });
  }
  return result;
}
