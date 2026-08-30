import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { request } from 'node:http';
import { CONFIG_DIR_NAME } from '@/config/paths';
import { LOCAL_SERVER, FILES } from '@/config/constants';

export const LOCAL_SERVER_PORT = LOCAL_SERVER.PORT;

function pidFile(projectDir: string): string {
  return join(projectDir, CONFIG_DIR_NAME, FILES.SERVER_PID);
}

/**
 * True when the local object server is already running on the configured port.
 */
export function isLocalServerRunning(projectDir: string): boolean {
  const pidPath = pidFile(projectDir);
  if (!existsSync(pidPath)) return false;
  try {
    const pid = parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    // Verify the process is alive and bound to our port.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Start the local static file server serving .bazel_git_lfs/objects as a
 * detached background process (so it outlives the CLI). Reuses an already
 * running server. Returns the base URL (e.g. http://localhost:8022).
 */
export async function ensureLocalServer(projectDir: string): Promise<string> {
  const objectsDir = join(projectDir, CONFIG_DIR_NAME, 'objects');
  const pidPath = pidFile(projectDir);

  if (isLocalServerRunning(projectDir)) {
    return `http://localhost:${LOCAL_SERVER_PORT}`;
  }

  const entry = join(__dirname, 'local-server-entry.js');
  const child = spawn(
    process.execPath,
    [entry, objectsDir, String(LOCAL_SERVER_PORT)],
    {
      detached: true,
      stdio: 'ignore',
    },
  );
  child.unref();
  writeFileSync(pidPath, String(child.pid));

  // Give the server a moment to bind, polling the port directly (no proxy).
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (await isPortOpen(LOCAL_SERVER_PORT)) break;
  }
  return `http://localhost:${LOCAL_SERVER_PORT}`;
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port, path: '/', method: 'GET', timeout: 500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * Stop the local object server if it is running.
 */
export function stopLocalServer(projectDir: string): void {
  const pidPath = pidFile(projectDir);
  if (!existsSync(pidPath)) return;
  try {
    const pid = parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // already dead
      }
    }
  } catch {
    // ignore
  }
  rmSync(pidPath, { force: true });
}
