/**
 * Minimal INI-style parser/serializer for `.bazel_git_lfs/.bazelconfig`.
 *
 * Supports the subset of git-config semantics this project needs:
 * - `[section]` blocks
 * - `key = value` (set) and `key += value` (append within same section)
 * - array literals `[a, b]` and `+= [a, b]`
 * - quoted values (single or double quotes, quote-inside-comma preserved)
 * - `#` / `;` line comments
 *
 * Values are flattened to dotted keys (`section.key`) exactly like git config.
 * Append (`+=`) only accumulates within the same `[section]`; a different
 * section with the same key does not accumulate.
 */

export interface IniEntry {
  key: string;
  value: string;
}

export type IniEntries = IniEntry[];

/** Split a raw line's value into array elements, honoring `[a, b]` and quotes. */
export function parseArrayValue(raw: string): string[] {
  const trimmed = raw.trim();

  // Array literal: [a, b]  or  [] (empty)
  if (trimmed.startsWith('[')) {
    const inner = trimmed.slice(1, trimmed.endsWith(']') ? -1 : trimmed.length).trim();
    if (inner.length === 0) return [];
    return splitRespectingQuotes(inner).map((s) => unquote(s.trim())).filter((s) => s.length > 0);
  }

  // Plain scalar → single-element array.
  return [unquote(trimmed)];
}

/** Split on commas outside of quotes. */
function splitRespectingQuotes(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (const ch of input) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/** Strip matching surrounding quotes from a token. */
export function unquote(token: string): string {
  const t = token.trim();
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return t.slice(1, -1);
    }
  }
  return t;
}

/** Strip a trailing `#`/`;` comment that is outside any quotes. */
export function stripComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#' || ch === ';') {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Parse INI text into ordered entries.
 *
 * Keys are tracked per `section.key` in a Map so that:
 * - `=` resets a key's entries (overwriting any prior `=`/`+=`).
 * - `+=` appends to the same `section.key` (not across sections).
 * Output order preserves the last assignment position of each key.
 */
export function parseIni(text: string): IniEntries {
  // section.key -> { entries: IniEntry[], order: number }
  const acc = new Map<string, { entries: IniEntry[]; order: number }>();

  let section = '';
  let counter = 0;
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = stripComment(rawLine).trim();
    if (line.length === 0) continue;

    // Section header: [name] — sections are case-insensitive like keys.
    const sectionMatch = line.match(/^\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim().toLowerCase();
      continue;
    }

    // key = value  |  key += value
    const assignMatch = line.match(/^([^=\s]+)\s*(\+=|=)\s*(.*)$/);
    if (!assignMatch) continue; // skip malformed lines

    const key = assignMatch[1].trim().toLowerCase();
    const op = assignMatch[2];
    const elements = parseArrayValue(assignMatch[3]);
    const full = fullKey(section, key);

    if (op === '=') {
      acc.set(full, { entries: elements.map((value) => ({ key: full, value })), order: counter++ });
      continue;
    }

    // `+=`
    const existing = acc.get(full);
    if (existing) {
      existing.entries.push(...elements.map((value) => ({ key: full, value })));
    } else {
      acc.set(full, { entries: elements.map((value) => ({ key: full, value })), order: counter++ });
    }
  }

  // Sort by first-assignment order, then flatten entries in order.
  const ordered = [...acc.values()].sort((a, b) => a.order - b.order);
  return ordered.flatMap((g) => g.entries);
}

function fullKey(section: string, key: string): string {
  return section.length > 0 ? `${section}.${key}` : key;
}

/** Serialize a flat set of `section.key = value` entries into INI text. */
export function serializeIni(entries: IniEntries): string {
  const sections = new Map<string, IniEntry[]>();
  for (const entry of entries) {
    const dot = entry.key.indexOf('.');
    const section = dot >= 0 ? entry.key.slice(0, dot) : '';
    const key = dot >= 0 ? entry.key.slice(dot + 1) : entry.key;
    const list = sections.get(section) ?? [];
    list.push({ key, value: entry.value });
    sections.set(section, list);
  }

  const lines: string[] = [];
  for (const [section, list] of sections) {
    if (section.length > 0) {
      lines.push(`[${section}]`);
    }
    for (const entry of list) {
      lines.push(`${entry.key} = ${entry.value}`);
    }
  }
  return lines.join('\n') + '\n';
}
