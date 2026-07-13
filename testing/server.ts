/**
 * Test-only harness for driving a TanStack Start server fn's real inline `.handler(...)` body
 * through the real server-fn RPC route, using Vite's own dev server (the same request-handling
 * stack `pnpm dev` runs) in process instead of a spawned child process + TCP port. See the file
 * comment in src/lib/artifacts.int.test.ts for the full rationale and the internal-API risk this
 * accepts. Shared by any `*.int.test.ts` that needs to exercise an inline handler body for real
 * rather than through a thinner seam.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createServer } from 'vite';

export interface DevServerHandle {
  fetch: (request: Request) => Promise<Response>;
}

export interface TestServer {
  vite: Awaited<ReturnType<typeof createServer>>;
  devServer: DevServerHandle;
}

/** Boots the real app (Nitro + TanStack Start plugins included) in process. */
export async function bootTestServer(configFileUrl: URL): Promise<TestServer> {
  const vite = await createServer({
    configFile: fileURLToPath(configFileUrl),
    // ws: false - this harness boots once and tears down; it never edits source files, so there's
    // nothing to hot-reload. More importantly, Vite creates its websocket server
    // (createWebSocketServer, gated on `config.server.ws`, not `config.server.hmr`) on a *fixed*
    // default port (24678) regardless of middlewareMode or `hmr: false` - so with multiple
    // *.int.test.ts files each booting their own dev server instance (this one, plus
    // account.int.test.ts's), running more than one at a time (concurrent vitest workers, or two
    // `pnpm test` runs at once) collided on that port. (This turned out to be a red herring for the
    // flake below - see the comment on waitUntilNitroReady - but it's a real, avoidable collision
    // in its own right, so it stays fixed.)
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  });
  const devServer = (vite.environments.nitro as unknown as { devServer: DevServerHandle })
    .devServer;

  await waitUntilNitroReady(devServer);

  return { vite, devServer };
}

/**
 * `vite.createServer()` resolves before Nitro's own dev environment (a separate `ViteEnvRunner` -
 * see nitro-nightly/dist/runtime/internal/vite/dev-worker.mjs) has necessarily finished its own
 * async module-runner initialization. That runner's `fetch()` retries internally for a *fixed*
 * budget (5 tries, 100ms * 2^attempt backoff - about 3.1s total) before giving up and throwing a
 * 503 ("Vite environment \"nitro\" is unavailable"). Under normal load the runner is ready well
 * within that budget and this is invisible; under CPU contention (e.g. several `*.int.test.ts`
 * files each booting their own dev server concurrently) initialization can take longer than nitro's
 * fixed 3.1s retry window, and every request this harness makes - including sign-in - gets that 503
 * instead. Uncaught, that turned an empty session cookie into every subsequent authenticated call
 * reading as a plain "Unauthorized", which looked exactly like a real auth bug. Fixed at the
 * source: block here, with our own much larger and backoff-based retry budget, until a real
 * (non-Nitro-runner-503) response comes back from a side-effect-free route, before handing the
 * server back to the caller.
 */
async function waitUntilNitroReady(devServer: DevServerHandle, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await devServer.fetch(new Request('http://localhost/healthz'));

      if (response.status !== 503) {
        return;
      }

      lastError = new Error(`healthz returned 503: ${await response.text()}`);
    } catch (error) {
      lastError = error;
    }

    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, Math.min(100 * 2 ** attempt, 1000)));
  }

  throw new Error(`Nitro dev environment never became ready within ${timeoutMs}ms`, {
    cause: lastError,
  });
}

/**
 * Collapses the response's Set-Cookie headers into one Cookie header value: attributes stripped,
 * cookies joined with '; '.
 */
export function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((raw) => raw.split(';')[0])
    .join('; ');
}

/**
 * Signs in against the real /api/auth/sign-in/email endpoint and returns the session cookie header.
 * Asserts loudly on failure (rather than letting a blank cookie surface later as an opaque
 * "Unauthorized" from every authenticated call that follows) - see waitUntilNitroReady's comment
 * for the failure mode this guards against.
 */
export async function signInOwner(
  server: TestServer,
  origin: string,
  email: string,
  password: string,
): Promise<string> {
  const response = await server.devServer.fetch(
    new Request(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  );

  if (response.status !== 200) {
    throw new Error(`owner sign-in failed with ${response.status}: ${await response.text()}`);
  }

  const cookie = cookieHeader(response);

  if (!cookie) {
    throw new Error('owner sign-in returned 200 but no session cookie');
  }

  return cookie;
}

/**
 * @tanstack/start-storage-context keys its AsyncLocalStorage off a global Symbol.for(...) registry
 * key, so we can drive the same store from here without resolving that package's own node_modules
 * location (it's nested under start-client-core's private dependency graph, not a peer of
 * react-start).
 */
const START_STORAGE_KEY = Symbol.for('tanstack-start:start-storage-context');
const globalWithStartStorage = globalThis as unknown as Record<symbol, AsyncLocalStorage<unknown>>;

if (!globalWithStartStorage[START_STORAGE_KEY]) {
  globalWithStartStorage[START_STORAGE_KEY] = new AsyncLocalStorage();
}

const startStorage = globalWithStartStorage[START_STORAGE_KEY];

function runWithStartContext<T>(fn: () => Promise<T>): Promise<T> {
  return startStorage.run({ startOptions: {} }, fn);
}

interface ServerFnResult {
  result: unknown;
  error: unknown;
}
export type ServerFnCaller = (data: unknown, opts?: { cookie?: string }) => Promise<unknown>;

/**
 * Derives the real RPC functionId for `${exportName}` in the module at `modulePath` (a
 * `/src/...`-rooted path, as Vite's dev server addresses modules) and returns a caller that drives
 * it through the real dev server, unwrapping `{result, error}` the way `createServerFn`'s own
 * client wrapper does (throwing `error`, returning `result`).
 */
export async function serverFnCaller(
  server: TestServer,
  modulePath: string,
  exportName: string,
  method: 'GET' | 'POST',
  origin: string,
): Promise<ServerFnCaller> {
  const transformed = await server.vite.environments.client.transformRequest(modulePath);
  const pattern = new RegExp(
    `export const ${exportName} = createServerFn\\(.*?createClientRpc\\("([^"]+)"\\)`,
  );
  const match = transformed?.code.match(pattern);
  const functionId = match?.[1];

  if (!functionId) {
    throw new Error(`could not locate the compiled RPC id for ${exportName} in ${modulePath}`);
  }

  const reactStartPkgUrl = import.meta.resolve('@tanstack/react-start/package.json');
  const scopeNodeModules = dirname(dirname(dirname(fileURLToPath(reactStartPkgUrl))));
  const clientRpcEntry = join(
    scopeNodeModules,
    '@tanstack/start-client-core/dist/esm/client-rpc/index.js',
  );
  const { createClientRpc } = (await import(pathToFileURL(clientRpcEntry).href)) as {
    createClientRpc: (id: string) => (opts: Record<string, unknown>) => Promise<ServerFnResult>;
  };
  const clientFn = createClientRpc(functionId);

  const bridgedFetch = (url: string, init: RequestInit) =>
    server.devServer.fetch(new Request(new URL(url, origin), init));

  return async (data, opts = {}) => {
    const raw = await runWithStartContext(() =>
      clientFn({
        method,
        data,
        headers: {
          ...(opts.cookie ? { cookie: opts.cookie } : {}),
          origin,
          // Satisfies TanStack Start's default CSRF middleware, which accepts either a matching
          // `sec-fetch-site: same-origin` or an `Origin` matching the request's own origin -
          // neither of which a raw fetch() sends automatically the way a browser would.
          'sec-fetch-site': 'same-origin',
        },
        fetch: bridgedFetch,
      }),
    );

    if (raw.error) {
      throw raw.error instanceof Error ? raw.error : new Error(JSON.stringify(raw.error));
    }

    return raw.result;
  };
}
