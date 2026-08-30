// Node <20 does not define a global File; undici references it during import.
if (typeof (globalThis as { File?: unknown }).File === 'undefined') {
  (globalThis as { File?: unknown }).File = class File {
    constructor(public name = '', public lastModified = 0) {}
  } as unknown as typeof File;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const undici = require('undici') as typeof import('undici');
const { fetch: undiciFetch, ProxyAgent, Agent, setGlobalDispatcher } = undici;

type DispatcherType = import('undici').Dispatcher;

function pickProxyUrl(): { value: string; source: string } | null {
  const env = process.env;
  const candidates: Array<[string, string | undefined]> = [
    ['HTTPS_PROXY', env.HTTPS_PROXY],
    ['https_proxy', env.https_proxy],
    ['HTTP_PROXY', env.HTTP_PROXY],
    ['http_proxy', env.http_proxy],
    ['ALL_PROXY', env.ALL_PROXY],
    ['all_proxy', env.all_proxy],
  ];
  for (const [name, value] of candidates) {
    if (value && value.trim().length > 0) {
      return { value: value.trim(), source: name };
    }
  }
  return null;
}

/**
 * Configure fetch to honor standard proxy env vars (HTTPS_PROXY/HTTP_PROXY/ALL_PROXY).
 * Overrides globalThis.fetch with a proxy-aware wrapper so all callers benefit.
 */
export function setupProxy(): void {
  const picked = pickProxyUrl();
  if (picked) {
    process.stderr.write(`[proxy] using proxy from ${picked.source}: ${picked.value}\n`);
    const agent = new ProxyAgent(picked.value) as DispatcherType;
    setGlobalDispatcher(agent);
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      undiciFetch(input as Parameters<typeof undiciFetch>[0], {
        ...(init as Parameters<typeof undiciFetch>[1]),
        dispatcher: agent,
      }) as unknown as Promise<Response>;
  } else {
    setGlobalDispatcher(new Agent() as DispatcherType);
  }
}

export function proxyEnabled(): boolean {
  return pickProxyUrl() !== null;
}

export function proxyUrl(): string | null {
  return pickProxyUrl()?.value ?? null;
}
