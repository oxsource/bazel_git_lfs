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

function pickProxyUrl(): string | null {
  const env = process.env;
  const proxy =
    env.HTTPS_PROXY ||
    env.https_proxy ||
    env.HTTP_PROXY ||
    env.http_proxy ||
    env.ALL_PROXY ||
    env.all_proxy;
  return proxy && proxy.trim().length > 0 ? proxy.trim() : null;
}

/**
 * Configure fetch to honor standard proxy env vars (HTTPS_PROXY/HTTP_PROXY/ALL_PROXY).
 * Overrides globalThis.fetch with a proxy-aware wrapper so all callers benefit.
 */
export function setupProxy(): void {
  const proxy = pickProxyUrl();
  if (proxy) {
    const agent = new ProxyAgent(proxy) as DispatcherType;
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
  return pickProxyUrl();
}
