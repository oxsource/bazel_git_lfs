import { Dependency } from './models';
import { extractDepsByRegex } from './regex-extractor';

export interface ParsedFile {
  dependencies: Dependency[];
  warnings: string[];
  loads: { target: string; symbols: string[] }[];
}

const RULE_NAMES = new Set(['http_archive', 'http_file']);

export function parseBazelFile(content: string, sourceFile: string): ParsedFile {
  const cleaned = stripComments(content);
  let statements;
  try {
    statements = splitStatements(cleaned);
  } catch {
    throw new Error(`Cannot parse Bazel file: ${sourceFile}`);
  }

  const deps: Dependency[] = [];
  const warnings: string[] = [];
  const loads: { target: string; symbols: string[] }[] = [];
  const symbols: Record<string, unknown> = {};

  let i = 0;
  while (i < statements.length) {
    const stmt = statements[i];
    const trimmed = stmt.text.trim();
    if (trimmed.length === 0) {
      i++;
      continue;
    }
    if (trimmed.startsWith('for ') && trimmed.endsWith(':')) {
      // Collect the indented body (subsequent statements more indented than the for).
      const body: string[] = [];
      let j = i + 1;
      while (j < statements.length && statements[j].indent > stmt.indent) {
        body.push(statements[j].text);
        j++;
      }
      const loop = parseForLoop(trimmed, body);
      if (loop) {
        const iterable = resolveValue(loop.iterable, symbols);
        const items = Array.isArray(iterable) ? iterable : [];
        for (const item of items) {
          const scope = { ...symbols, [loop.varName]: item };
          for (const bodyStmt of loop.body) {
            processStatement(bodyStmt, sourceFile, scope, deps, warnings, loads);
          }
        }
      }
      i = j;
      continue;
    }
    processStatement(trimmed, sourceFile, symbols, deps, warnings, loads);
    i++;
  }

  // Regex fallback: scan the raw source for name/url(s)/sha256 literals that
  // the structural parser may have missed (dict-driven declarations, wrapper
  // functions, etc.). Only add names the structural parser did not see at
  // all — never deduplicate or rewrite structural results (which preserves
  // duplicate-declaration conflict detection downstream).
  const structuralNames = new Set(deps.map((d) => d.name));
  for (const regexDep of extractDepsByRegex(content)) {
    if (!structuralNames.has(regexDep.name)) {
      deps.push(regexDep);
    }
  }
  return { dependencies: deps, warnings, loads };
}

function processStatement(
  stmt: string,
  sourceFile: string,
  symbols: Record<string, unknown>,
  deps: Dependency[],
  warnings: string[],
  loads: { target: string; symbols: string[] }[],
): void {
  const assignment = parseAssignment(stmt);
  if (assignment) {
    const value = parseStarlarkValue(assignment.value);
    symbols[assignment.name] = value;
    return;
  }
  if (stmt.startsWith('load(')) {
    const load = parseLoad(stmt);
    if (load) {
      loads.push(load);
    }
    return;
  }
  const rule = parseRuleCall(stmt);
  if (rule) {
    if (RULE_NAMES.has(rule.name)) {
      const dep = buildDependency(rule, sourceFile, symbols);
      if (dep) {
        deps.push(dep);
      } else {
        warnings.push(
          `${sourceFile}: could not resolve ${rule.name} rule (${rule.attrs.name ?? '<unknown name>'})`,
        );
      }
      return;
    }
  }
  // Wrapper pattern: _guard(http_archive, "name", kwargs) — the first
  // argument is the rule name, the rest are the rule's own arguments.
  const wrapped = parseWrappedRuleCall(stmt, symbols);
  if (wrapped) {
    const dep = buildDependency(wrapped, sourceFile, symbols);
    if (dep) {
      deps.push(dep);
    } else {
      warnings.push(
        `${sourceFile}: could not resolve wrapped ${wrapped.name} rule (${wrapped.attrs.name ?? '<unknown name>'})`,
      );
    }
  }
}

interface WrappedRuleCall {
  name: string;
  attrs: Record<string, unknown>;
}

/**
 * Recognize wrapper functions like `_guard(http_archive, "name", kwargs)`
 * where the first argument is the rule name and the remaining arguments are
 * the rule call's own arguments (positional name and/or kwargs dict).
 */
function parseWrappedRuleCall(
  stmt: string,
  symbols: Record<string, unknown>,
): WrappedRuleCall | null {
  const match = /^([a-zA-Z_][a-zA-Z0-9_]*)\(([\s\S]*)\)$/.exec(stmt);
  if (!match) {
    return null;
  }
  const args = splitTopLevel(match[2], ',');
  if (args.length < 2) {
    return null;
  }
  const ruleName = args[0].trim();
  if (!RULE_NAMES.has(ruleName)) {
    return null;
  }

  const attrs: Record<string, unknown> = {};
  const rest = args.slice(1);
  // `dep["name"]` — name expression (positional).
  if (!rest[0].trim().includes('=')) {
    attrs['name'] = rest[0].trim();
  }
  // Remaining args: `key = value` pairs and/or a kwargs dict identifier.
  for (const arg of rest) {
    const trimmed = arg.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const eq = findTopLevel(trimmed, '=');
    if (eq >= 0) {
      attrs[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
      continue;
    }
    // Bare identifier referencing a kwargs dict in the symbol table.
    const kwName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.exec(trimmed)?.[0];
    if (kwName) {
      let value = resolveRef(parseStarlarkValue(trimmed), symbols);
      // Resolve nested { __dictComp: ... } / { __ref: ... } values.
      value = resolveRef(value, symbols);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (k === 'name') continue;
          attrs[k] = v;
        }
      }
    }
  }

  return { name: ruleName, attrs };
}

function buildDependency(
  rule: { name: string; attrs: Record<string, unknown> },
  sourceFile: string,
  symbols: Record<string, unknown>,
): Dependency | null {
  const name = resolveScalar(rule.attrs['name'], symbols);
  const urls = resolveUrls(rule.attrs['url'] ?? rule.attrs['urls'], symbols);
  const sha256 = resolveScalar(rule.attrs['sha256'], symbols);
  const stripPrefix = resolveScalar(rule.attrs['strip_prefix'], symbols);

  if (typeof name !== 'string' || name.length === 0) {
    return null;
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    return null;
  }

  return {
    name,
    urls,
    sha256: typeof sha256 === 'string' ? sha256 : null,
    stripPrefix: typeof stripPrefix === 'string' ? stripPrefix : null,
    sourceFile,
    resolved: true,
  };
}

interface RuleCall {
  name: string;
  attrs: Record<string, unknown>;
}

function parseRuleCall(stmt: string): RuleCall | null {
  const match = /^([a-zA-Z_][a-zA-Z0-9_]*)\(([\s\S]*)\)$/.exec(stmt);
  if (!match) {
    return null;
  }
  const name = match[1];
  if (!RULE_NAMES.has(name)) {
    return null;
  }
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of splitArgs(match[2])) {
    attrs[key] = value.trim();
  }
  return { name, attrs };
}

function splitArgs(body: string): [string, string][] {
  const result: [string, string][] = [];
  const parts = splitTopLevel(body, ',');
  for (const part of parts) {
    const eq = findTopLevel(part, '=');
    if (eq < 0) {
      continue;
    }
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key.length > 0) {
      result.push([key, value]);
    }
  }
  return result;
}

function parseAssignment(stmt: string): { name: string; value: string } | null {
  const match = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([\s\S]+)$/.exec(stmt);
  if (!match) {
    return null;
  }
  return { name: match[1], value: match[2].trim() };
}

interface ForLoop {
  varName: string;
  iterable: string;
  body: string[];
}

function parseForLoop(stmt: string, body: string[]): ForLoop | null {
  const match = /^for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:$/.exec(stmt);
  if (!match) {
    return null;
  }
  const cleanedBody = body.map((l) => l.trim()).filter((l) => l.length > 0);
  return { varName: match[1], iterable: match[2].trim(), body: cleanedBody };
}

function parseLoad(stmt: string): { target: string; symbols: string[] } | null {
  const match = /^load\(\s*"([^"]+)"([\s\S]*)\)$/.exec(stmt);
  if (!match) {
    return null;
  }
  const symbols: string[] = [];
  const rest = match[2];
  if (rest.trim().length === 0) {
    return { target: match[1], symbols };
  }
  // Extract symbol names: `"sym"`, `sym` (with optional `as` alias), and `[ ... ]` lists.
  const symbolMatches = rest.matchAll(/["']?([A-Za-z_][A-Za-z0-9_]*)["']?/g);
  for (const m of symbolMatches) {
    const sym = m[1];
    if (sym === 'as') {
      continue;
    }
    symbols.push(sym);
  }
  return { target: match[1], symbols };
}

function stripComments(content: string): string {
  let inString: string | null = null;
  let result = '';
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      result += ch;
      if (ch === '\\') {
        result += content[i + 1] ?? '';
        i++;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      result += ch;
      continue;
    }
    if (ch === '#') {
      while (i < content.length && content[i] !== '\n') {
        i++;
      }
      result += '\n';
      continue;
    }
    result += ch;
  }
  return result;
}

function splitStatements(content: string): { text: string; indent: number }[] {
  const statements: { text: string; indent: number }[] = [];
  let depth = 0;
  let current = '';
  let lineIndent = 0;
  let atLineStart = true;
  let inString: string | null = null;

  const flush = () => {
    if (current.trim().length > 0) {
      statements.push({ text: current, indent: lineIndent });
    }
    current = '';
    lineIndent = 0;
    atLineStart = true;
  };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (atLineStart && (ch === ' ' || ch === '\t')) {
      lineIndent++;
      continue;
    }
    atLineStart = false;

    if (inString) {
      current += ch;
      if (ch === '\\') {
        current += content[i + 1] ?? '';
        i++;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
    }
    if (ch === '\n' && depth === 0) {
      flush();
      continue;
    }
    current += ch;
  }
  if (depth !== 0 || inString !== null) {
    throw new Error('unbalanced brackets or unterminated string');
  }
  flush();
  return statements;
}

function splitTopLevel(input: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let inString: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      current += ch;
      if (ch === '\\') {
        current += input[i + 1] ?? '';
        i++;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      current += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
    }
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) {
    parts.push(current);
  }
  return parts;
}

function findTopLevel(input: string, target: string): number {
  let depth = 0;
  let inString: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (ch === '\\') {
        i++;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
    }
    if (ch === target && depth === 0) {
      return i;
    }
  }
  return -1;
}

function parseStarlarkValue(text: string): unknown {
  const trimmed = text.trim();
  // Dict comprehension: {k: v for k, v in OBJ.items() [if cond]}
  const dictComp = /^\{[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*.+?\s+for\s+[a-zA-Z_][a-zA-Z0-9_]*\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*\s+in\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*\.items\(\)\s*(?:if\s+.+)?\}$/.exec(trimmed);
  if (dictComp) {
    return { __dictComp: dictComp[1] };
  }
  if (trimmed.startsWith('[')) {
    const inner = trimmed.slice(1, trimmed.lastIndexOf(']')).trim();
    if (inner.length === 0) {
      return [];
    }
    return splitTopLevel(inner, ',').map((item) => parseStarlarkValue(item));
  }
  if (trimmed.startsWith('{')) {
    const inner = trimmed.slice(1, trimmed.lastIndexOf('}')).trim();
    if (inner.length === 0) {
      return {};
    }
    const obj: Record<string, unknown> = {};
    for (const part of splitTopLevel(inner, ',')) {
      const colon = findTopLevel(part, ':');
      if (colon < 0) {
        continue;
      }
      const key = parseStarlarkValue(part.slice(0, colon));
      const value = parseStarlarkValue(part.slice(colon + 1));
      obj[String(key)] = value;
    }
    return obj;
  }
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    return unquote(trimmed);
  }
  // Treat any non-literal as an identifier reference (resolved via symbol table).
  // Handle `VAR["key"]` / `VAR["key"]["sub"]` subscripts and plain `VAR`.
  return { __ref: trimmed };
}

function unquote(text: string): string {
  const inner = text.slice(1, -1);
  return inner.replace(/\\"/g, '"').replace(/\\n/g, '\n');
}

function resolveValue(expr: string, symbols: Record<string, unknown>): unknown {
  return resolveExpression(expr.trim(), symbols);
}

function resolveScalar(value: unknown, symbols: Record<string, unknown>): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    // Already-resolved value (e.g. from a kwargs dict expansion).
    return value;
  }
  const parsed = parseStarlarkValue(value);
  const resolved = resolveRef(parsed, symbols);
  if (resolved === undefined) {
    // Treat an unresolvable bare string as a literal (e.g. a sha256 hex or
    // a URL produced by dict expansion).
    return value;
  }
  return resolved;
}

function resolveRef(value: unknown, symbols: Record<string, unknown>): unknown {
  if (value && typeof value === 'object' && '__ref' in (value as Record<string, unknown>)) {
    const name = (value as Record<string, unknown>).__ref as string;
    return resolveExpression(name, symbols);
  }
  if (value && typeof value === 'object' && '__dictComp' in (value as Record<string, unknown>)) {
    const sourceName = (value as Record<string, unknown>).__dictComp as string;
    const source = resolveExpression(sourceName, symbols);
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      // Shallow-copy the dict (e.g. a dependency entry) as a kwargs map.
      return { ...(source as Record<string, unknown>) };
    }
    return undefined;
  }
  return value;
}

function resolveExpression(expr: string, symbols: Record<string, unknown>): unknown {
  const subscript = /^([a-zA-Z_][a-zA-Z0-9_]*)((?:\s*\[\s*"([^"]+)"\s*\])+)$/.exec(expr);
  if (subscript) {
    const base = symbols[subscript[1]];
    if (base === undefined) {
      return undefined;
    }
    const keys = [...expr.matchAll(/\[\s*"([^"]+)"\s*\]/g)].map((m) => m[1]);
    let current: unknown = base;
    for (const key of keys) {
      if (current && typeof current === 'object') {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }
    return current;
  }
  return symbols[expr];
}

function resolveUrls(value: unknown, symbols: Record<string, unknown>): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    // Already-resolved value (e.g. array from a kwargs dict expansion).
    return value;
  }
  const parsed = parseStarlarkValue(value);
  const resolved = resolveRef(parsed, symbols);
  if (typeof resolved === 'string') {
    return [resolved];
  }
  if (resolved === undefined) {
    // Unresolvable bare string — treat as a literal URL.
    return [value];
  }
  return resolved;
}
