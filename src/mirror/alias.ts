export const RESERVED_ALIASES = {
  DEFAULT: 'default',
  LOCAL: 'local',
} as const;

export const RESERVED_SHORTHANDS: Record<string, string> = {
  '--': RESERVED_ALIASES.DEFAULT,
  '@': RESERVED_ALIASES.LOCAL,
};

export const RESERVED_NAMES: readonly string[] = [
  RESERVED_ALIASES.DEFAULT,
  RESERVED_ALIASES.LOCAL,
];

export function isReservedAlias(name: string): boolean {
  return RESERVED_NAMES.includes(name) || Object.keys(RESERVED_SHORTHANDS).includes(name);
}

export function assertNotReserved(name: string): void {
  if (name === RESERVED_ALIASES.LOCAL) {
    throw new Error(`"${name}" is a reserved alias and cannot be used as a profile name`);
  }
}

export function resolveAlias(alias: string): string {
  return RESERVED_SHORTHANDS[alias] ?? alias;
}