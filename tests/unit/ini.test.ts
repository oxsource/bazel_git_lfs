import { describe, expect, it } from 'vitest';
import { parseIni, parseArrayValue, serializeIni, unquote, stripComment } from '@/config/ini';

describe('parseIni', () => {
  it('parses sections and flat dotted keys', () => {
    const entries = parseIni(`
[server]
port = 9022
`);
    expect(entries).toEqual([{ key: 'server.port', value: '9022' }]);
  });

  it('supports append (+=) accumulating array values in the same section', () => {
    const entries = parseIni(`
[inspect]
exclude = a
exclude += b
exclude += c
`);
    expect(entries).toEqual([
      { key: 'inspect.exclude', value: 'a' },
      { key: 'inspect.exclude', value: 'b' },
      { key: 'inspect.exclude', value: 'c' },
    ]);
  });

  it('supports array literal [a, b] and mixed with +=', () => {
    const entries = parseIni(`
[inspect]
exclude = [a, b]
exclude += [c, d]
`);
    expect(entries).toEqual([
      { key: 'inspect.exclude', value: 'a' },
      { key: 'inspect.exclude', value: 'b' },
      { key: 'inspect.exclude', value: 'c' },
      { key: 'inspect.exclude', value: 'd' },
    ]);
  });

  it('respects quotes and commas inside quotes', () => {
    const entries = parseIni(`
[inspect]
append = dep_a|https://x.org/a.tar.gz|sha1
append += dep_b|https://x.org/b.tar.gz|sha2
`);
    expect(entries).toEqual([
      { key: 'inspect.append', value: 'dep_a|https://x.org/a.tar.gz|sha1' },
      { key: 'inspect.append', value: 'dep_b|https://x.org/b.tar.gz|sha2' },
    ]);
  });

  it('does not accumulate across different sections', () => {
    const entries = parseIni(`
[a]
x = 1
[b]
x += 2
`);
    expect(entries).toEqual([
      { key: 'a.x', value: '1' },
      { key: 'b.x', value: '2' },
    ]);
  });

  it('overwrites on = after prior +=', () => {
    const entries = parseIni(`
[inspect]
exclude = a
exclude += b
exclude = [c]
`);
    expect(entries).toEqual([{ key: 'inspect.exclude', value: 'c' }]);
  });

  it('ignores comment lines and inline comments', () => {
    const entries = parseIni(`
# full comment
; semicolon comment
[server]
port = 9022 # inline comment
`);
    expect(entries).toEqual([{ key: 'server.port', value: '9022' }]);
  });

  it('lowercases keys', () => {
    const entries = parseIni('[Inspect]\nExclude = x');
    expect(entries).toEqual([{ key: 'inspect.exclude', value: 'x' }]);
  });
});

describe('parseArrayValue', () => {
  it('parses a scalar as single element', () => {
    expect(parseArrayValue('9022')).toEqual(['9022']);
  });

  it('parses array literal', () => {
    expect(parseArrayValue('[a, b, c]')).toEqual(['a', 'b', 'c']);
  });

  it('parses empty array', () => {
    expect(parseArrayValue('[]')).toEqual([]);
  });

  it('supports quoted elements with commas', () => {
    expect(parseArrayValue('["a,b", c]')).toEqual(['a,b', 'c']);
  });
});

describe('serializeIni', () => {
  it('groups by section and emits key = value', () => {
    const text = serializeIni([
      { key: 'server.port', value: '9022' },
      { key: 'inspect.exclude', value: 'a' },
    ]);
    expect(text).toBe('[server]\nport = 9022\n[inspect]\nexclude = a\n');
  });
});

describe('unquote', () => {
  it('strips matching quotes', () => {
    expect(unquote('"hello"')).toBe('hello');
    expect(unquote("'hi'")).toBe('hi');
  });
  it('keeps unbalanced quotes', () => {
    expect(unquote('"hello')).toBe('"hello');
  });
});

describe('stripComment', () => {
  it('strips trailing comment outside quotes', () => {
    expect(stripComment('port = 9022 # comment')).toBe('port = 9022 ');
  });
  it('keeps # inside quotes', () => {
    expect(stripComment('value = "a#b"')).toBe('value = "a#b"');
  });
});
