import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { FILES, LOCAL_SERVER } from '@/config/constants';
import { parseIni, IniEntries } from '@/config/ini';
import type { Dependency } from '@/inspect/models';

/** Parse an `append` row: `name|urls|sha256[|stripPrefix]`. */
export interface ManualDependency {
  name: string;
  urls: string[];
  sha256: string | null;
  stripPrefix: string | null;
}

const APPEND_FIELD_SEP = '|';

/**
 * Typed accessor over the project-local `.bazel_git_lfs/.bazelconfig` INI
 * file. Missing file / missing keys fall back to defaults; malformed values
 * are ignored rather than fatal.
 */
export class BazelConfig {
  private entries: IniEntries;

  constructor(entries: IniEntries) {
    this.entries = entries;
  }

  static fromFile(projectDir: string): BazelConfig {
    const path = join(projectDir, CONFIG_DIR_NAME, FILES.BAZELCONFIG);
    if (!existsSync(path)) return new BazelConfig([]);
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      return new BazelConfig([]);
    }
    return new BazelConfig(parseIni(text));
  }

  values(key: string): string[] {
    const values: string[] = [];
    for (const entry of this.entries) {
      if (entry.key === key) values.push(entry.value);
    }
    return values;
  }

  /** First value for a key, or undefined. */
  first(key: string): string | undefined {
    const entry = this.entries.find((e) => e.key === key);
    return entry?.value;
  }

  /** Local object server port (default 8022). */
  serverPort(): number {
    const raw = this.first('server.port');
    if (raw === undefined) return LOCAL_SERVER.PORT;
    const parsed = Number(raw.trim());
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : LOCAL_SERVER.PORT;
  }

  /** Dependency names to exclude from archiving (exact match). */
  inspectExclude(): string[] {
    return this.values('inspect.exclude').filter((v) => v.trim().length > 0);
  }

  /** Manually appended dependencies (missed by the scan). */
  inspectAppend(): ManualDependency[] {
    const deps: ManualDependency[] = [];
    for (const row of this.values('inspect.append')) {
      const parsed = parseAppendRow(row);
      if (parsed) deps.push(parsed);
    }
    return deps;
  }
}

function parseAppendRow(row: string): ManualDependency | null {
  const fields = row.split(APPEND_FIELD_SEP).map((s) => s.trim());
  if (fields.length < 3) return null;
  const [name, urlsRaw, sha256 = '', stripPrefix = ''] = fields;
  if (!name) return null;

  const urls = urlsRaw
    .split(',')
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
  if (urls.length === 0) return null;

  return {
    name,
    urls,
    sha256: sha256.length > 0 ? sha256 : null,
    stripPrefix: stripPrefix.length > 0 ? stripPrefix : null,
  };
}

/** Convert a manual dependency into the scan model used by inspect. */
export function toDependency(manual: ManualDependency): Dependency {
  return {
    name: manual.name,
    urls: manual.urls,
    sha256: manual.sha256,
    stripPrefix: manual.stripPrefix,
    sourceFile: 'manual',
    resolved: true,
  };
}
