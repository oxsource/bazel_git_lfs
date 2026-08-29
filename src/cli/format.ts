export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

export interface OutputOptions {
  json?: boolean;
}

function printResult(result: unknown, opts: OutputOptions): void {
  if (opts.json) {
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    if (typeof record.message === 'string') {
      process.stdout.write(record.message + '\n');
      return;
    }
  }
  process.stdout.write(JSON.stringify(result) + '\n');
}

function printError(message: string, opts: OutputOptions = {}, exitCode = EXIT_ERROR): void {
  if (opts.json) {
    process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n');
  } else {
    process.stderr.write(`error: ${message}\n`);
  }
  process.exitCode = exitCode;
}

function printUsageError(message: string, opts: OutputOptions = {}): void {
  printError(message, opts, EXIT_USAGE);
}

export const format = { printResult, printError, printUsageError };
