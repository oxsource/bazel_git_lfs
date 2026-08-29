import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
export interface OriginRouteSpec {
  /** Fixture file name (relative to fixturesDir) to serve as the body. */
  file?: string;
  /** Raw body bytes (overrides `file`). */
  body?: Buffer;
  /** HTTP status to serve (default 200). */
  status?: number;
  /** Close the response prematurely after N bytes (simulates truncated download). */
  truncateAfterBytes?: number;
  /** Accept the request but never respond (client timeout/abort must handle it). */
  hang?: boolean;
  /** Number of requests this route has received (mutated in place; assert against it). */
  hits: number;
}

export interface OriginServer {
  /** Base URL, e.g. http://127.0.0.1:<port> */
  url: string;
  /** Replace or add a route (e.g., to flip a path to an error mid-test). */
  setRoute: (path: string, spec: OriginRouteSpec) => void;
  /** Current hit count for a route path (0 if unknown). */
  hits: (path: string) => number;
  /** Requests to unknown paths (assert "zero unexpected origin requests"). */
  misses: () => number;
  /** Total handled requests (known routes + misses). */
  totalRequests: () => number;
  close: () => Promise<void>;
}

/**
 * Convenience: build route specs that serve fixture artifact files at the
 * given URL paths, e.g. `fixtureRoutes({ '/a.tar.gz': 'alpha.bin' })`.
 */
export function fixtureRoutes(
  map: Record<string, string>,
): Record<string, Omit<OriginRouteSpec, 'hits'>> {
  const routes: Record<string, Omit<OriginRouteSpec, 'hits'>> = {};
  for (const [path, fixtureFile] of Object.entries(map)) {
    routes[path] = { file: fixtureFile };
  }
  return routes;
}

/**
 * A local HTTP "origin" for fetch tests: serves fixture bytes with per-route
 * status / truncation / hang injection and per-route hit counting so tests can
 * assert exactly which origins were contacted.
 */
export async function startOriginServer(
  fixturesDir: string,
  initial: Record<string, Omit<OriginRouteSpec, 'hits'>> = {},
): Promise<OriginServer> {
  const specs = new Map<string, OriginRouteSpec>(
    Object.entries(initial).map(([path, spec]) => [path, { ...spec, hits: 0 }]),
  );
  let misses = 0;

  const server = createServer((req, res) => {
    const path = req.url ?? '/';
    const spec = specs.get(path);
    if (!spec) {
      misses += 1;
      res.writeHead(404);
      res.end();
      return;
    }
    spec.hits += 1;
    if (spec.hang) {
      return; // never respond; the client's timeout/abort handles it
    }

    const status = spec.status ?? 200;
    const respondWith = (body: Buffer): void => {
      const truncating = spec.truncateAfterBytes !== undefined && spec.truncateAfterBytes < body.length;
      if (truncating) {
        // Deliberately omit content-length so the short body reads as a
        // truncated/network EOF response instead of a hang.
        res.writeHead(status);
        res.end(body.subarray(0, spec.truncateAfterBytes));
        return;
      }
      res.writeHead(status, { 'content-length': String(body.length) });
      res.end(body);
    };

    if (spec.body) {
      respondWith(spec.body);
      return;
    }
    if (spec.file) {
      readFile(join(fixturesDir, spec.file))
        .then(respondWith)
        .catch((err: Error) => {
          res.writeHead(500);
          res.end(err.message);
        });
      return;
    }
    res.writeHead(500);
    res.end('route has no body');
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    setRoute(path, spec) {
      const hits = specs.get(path)?.hits ?? 0;
      specs.set(path, { ...spec, hits });
    },
    hits: (path) => specs.get(path)?.hits ?? 0,
    misses: () => misses,
    totalRequests: () => {
      let total = misses;
      for (const spec of specs.values()) {
        total += spec.hits;
      }
      return total;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        // Undici keep-alive sockets would keep close() waiting; drop them.
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
