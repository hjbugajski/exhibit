/**
 * Full-stack OAuth integration test: drives the ACTUAL flow an MCP client (e.g. claude.ai) uses
 * against this app's real Better Auth + oauth-provider config and our /mcp route: dynamic client
 * registration -> sign in -> PKCE authorize -> consent -> token exchange -> authenticated /mcp
 * JSON-RPC round trip.
 *
 * Runs a real, programmatically-started HTTP server on an ephemeral loopback port (bridging Node's
 * http to the app's Web-standard Request/Response handlers) rather than calling handlers
 * in-process, so the OAuth redirects/cookies/discovery URLs a real client follows resolve against a
 * live origin. (Bearer verification itself is local — see verifyMcpBearer — so the server exists
 * purely as the client-side harness.) The server is fully torn down when the test finishes; this is
 * test-fixture infrastructure, not a long-running dev server.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const OWNER_EMAIL = 'owner@example.com';
const OWNER_PASSWORD = 'correct horse battery staple';
const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());

  return { verifier, challenge };
}

/** Collapses Set-Cookie response headers into a single request Cookie header. */
function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((raw) => raw.split(';')[0])
    .join('; ');
}

/**
 * Better Auth's built-in rate limiter caps `/sign-in*` at 3 requests per 10s (a special rule, not
 * configurable via `rateLimit.enabled` above), so this suite signs in once and reuses the session
 * cookie across every helper call instead of hitting `/sign-in/email` per call — cheap to do since
 * the owner's session is unaffected by the OAuth calls that follow.
 */
let ownerCookie: string | undefined;

async function getOwnerCookie(): Promise<string> {
  if (ownerCookie) {
    return ownerCookie;
  }

  const { seedOwner } = await import('@/lib/seed');

  await seedOwner(OWNER_EMAIL, OWNER_PASSWORD);

  const signInResponse = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });

  ownerCookie = cookieHeader(signInResponse);

  return ownerCookie;
}

async function registerClient(): Promise<string> {
  const registerResponse = await fetch(`${baseURL}/api/auth/oauth2/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      client_name: 'exhibit-mcp-test-client',
    }),
  });
  const client = (await registerResponse.json()) as { client_id: string };

  return client.client_id;
}

/**
 * Dynamic client registration is rate-limited to 5 requests/60s (@better-auth/oauth-provider's
 * default `rateLimit.register`), so every helper below reuses one registered client rather than
 * registering fresh per call — pass `freshClient: true` for a case that needs its own (e.g. one
 * that gets revoked and must not affect other tests' client).
 */
let sharedClientId: string | undefined;

async function getSharedClientId(): Promise<string> {
  sharedClientId ??= await registerClient();

  return sharedClientId;
}

/**
 * Drives DCR -> sign-in -> PKCE authorize (steps 1-3) and stops at the consent screen, returning
 * everything needed to submit (or deny) consent — the shared setup for both `authorizeAndGetCode`
 * and the consent-denial case below. `scope`, if given, is requested on the authorize call (e.g.
 * `offline_access` to get a refresh token back from the token endpoint). Always sends
 * `prompt=consent` so the consent screen shows even when the (possibly reused) client already has a
 * stored grant from an earlier call.
 */
async function authorizeToConsent(
  scope?: string,
  options: { freshClient?: boolean } = {},
): Promise<{
  clientId: string;
  cookie: string;
  verifier: string;
  consentUrl: URL;
}> {
  const clientId = options.freshClient ? await registerClient() : await getSharedClientId();
  const cookie = await getOwnerCookie();

  const { verifier, challenge } = pkcePair();
  const state = base64url(randomBytes(16));
  const authorizeUrl = new URL(`${baseURL}/api/auth/oauth2/authorize`);

  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('prompt', 'consent');

  if (scope) {
    authorizeUrl.searchParams.set('scope', scope);
  }

  const authorizeResponse = await fetch(authorizeUrl, {
    headers: { cookie, accept: 'application/json' },
  });
  const authorizeJson = (await authorizeResponse.json()) as { redirect: boolean; url: string };
  const consentUrl = new URL(authorizeJson.url, baseURL);

  return { clientId, cookie, verifier, consentUrl };
}

/**
 * Drives DCR -> sign-in -> PKCE authorize -> consent (steps 1-4 of the full flow test below) and
 * returns a fresh, unexchanged authorization code plus the PKCE verifier that matches its challenge
 * — the shared setup for the token-exchange negative cases below.
 */
async function authorizeAndGetCode(
  scope?: string,
  options: { freshClient?: boolean } = {},
): Promise<{
  clientId: string;
  code: string;
  verifier: string;
}> {
  const { clientId, cookie, verifier, consentUrl } = await authorizeToConsent(scope, options);

  const consentResponse = await fetch(`${baseURL}/api/auth/oauth2/consent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ accept: true, oauth_query: consentUrl.search.slice(1) }),
  });
  const consentJson = (await consentResponse.json()) as { redirect: boolean; url: string };
  const redirectUrl = new URL(consentJson.url);
  const code = redirectUrl.searchParams.get('code');

  return { clientId, code: code ?? '', verifier };
}

async function nodeRequestToWebRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }

  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        headers.append(key, v);
      }
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const hasBody = !(req.method === 'GET' || req.method === 'HEAD');

  return new Request(new URL(req.url ?? '/', origin), {
    method: req.method,
    headers,
    body: hasBody && chunks.length > 0 ? Buffer.concat(chunks) : undefined,
  });
}

async function writeWebResponse(res: ServerResponse, response: Response): Promise<void> {
  response.headers.forEach((value, key) => {
    res.appendHeader(key, value);
  });
  res.statusCode = response.status;
  res.end(Buffer.from(await response.arrayBuffer()));
}

interface JsonRpcResponse {
  result?: {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    tools?: { name: string }[];
    serverInfo?: { name: string };
  };
  error?: unknown;
}

let server: Server;
let baseURL: string;

beforeAll(async () => {
  // 1. Start the real listener first so we know the ephemeral port before any app module (which
  // reads BASE_URL at import time) is loaded.
  server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('failed to determine ephemeral server port');
  }

  baseURL = `http://127.0.0.1:${address.port}`;
  process.env.BASE_URL = baseURL;

  const { auth } = await import('@/lib/auth');
  const { Route: McpRoute } = await import('@/routes/mcp');

  // 2. Now wire up real request handling, bridging Node's http to the app's Web-standard handlers
  // (auth.handler and the /mcp route's handlers).
  server.on('request', (req, res) => {
    void (async () => {
      const request = await nodeRequestToWebRequest(req, baseURL);
      const url = new URL(request.url);
      const mcpHandlers = McpRoute.options.server?.handlers;

      let response: Response;

      if (url.pathname === '/mcp' && mcpHandlers && typeof mcpHandlers === 'object') {
        const handler =
          request.method === 'POST'
            ? mcpHandlers.POST
            : request.method === 'DELETE'
              ? mcpHandlers.DELETE
              : mcpHandlers.GET;

        const handlerResult =
          typeof handler === 'function' ? await handler({ request } as never) : undefined;

        response =
          handlerResult instanceof Response ? handlerResult : new Response(null, { status: 404 });
      } else if (url.pathname.startsWith('/api/auth')) {
        response = await auth.handler(request);
      } else {
        response = new Response(null, { status: 404 });
      }

      await writeWebResponse(res, response);
    })();
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

async function mcpCall(
  accessToken: string,
  body: unknown,
): Promise<{ status: number; json: JsonRpcResponse }> {
  const response = await fetch(`${baseURL}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();

  return { status: response.status, json: (rawText ? JSON.parse(rawText) : {}) as JsonRpcResponse };
}

describe('MCP OAuth flow (DCR -> PKCE authorize -> consent -> token -> /mcp)', () => {
  it('drives the full flow a real MCP client would use, end to end', async () => {
    const { seedOwner } = await import('@/lib/seed');
    const { itineraryFixture } = await import('@/catalog/fixtures/itinerary');

    await seedOwner(OWNER_EMAIL, OWNER_PASSWORD);

    // 1. Dynamic client registration (public client, PKCE-only).
    const registerResponse = await fetch(`${baseURL}/api/auth/oauth2/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: [REDIRECT_URI],
        token_endpoint_auth_method: 'none',
        client_name: 'exhibit-mcp-test-client',
      }),
    });

    expect(registerResponse.status).toBe(200);
    const client = (await registerResponse.json()) as { client_id: string };
    expect(client.client_id).toBeTruthy();

    // 2. Sign in as the owner to get a session cookie.
    const signInResponse = await fetch(`${baseURL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
    });

    expect(signInResponse.status).toBe(200);
    const cookie = cookieHeader(signInResponse);
    expect(cookie.length).toBeGreaterThan(0);

    // 3. Authorize with PKCE S256. Sending `Accept: application/json` makes the endpoint return
    // `{redirect, url}` JSON instead of an HTTP redirect (see @better-auth/oauth-provider's
    // `handleRedirect`), which is easier to drive from a script than following a 302.
    const { verifier, challenge } = pkcePair();
    const state = base64url(randomBytes(16));
    const authorizeUrl = new URL(`${baseURL}/api/auth/oauth2/authorize`);

    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', client.client_id);
    authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('state', state);

    const authorizeResponse = await fetch(authorizeUrl, {
      headers: { cookie, accept: 'application/json' },
    });

    expect(authorizeResponse.status).toBe(200);
    const authorizeJson = (await authorizeResponse.json()) as { redirect: boolean; url: string };
    expect(authorizeJson.redirect).toBe(true);
    const consentUrl = new URL(authorizeJson.url, baseURL);
    expect(consentUrl.pathname).toBe('/consent');

    // 4. Consent: the redirected page's query string, re-submitted with its embedded signature —
    // this is exactly what src/routes/consent.tsx does.
    const consentResponse = await fetch(`${baseURL}/api/auth/oauth2/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ accept: true, oauth_query: consentUrl.search.slice(1) }),
    });

    expect(consentResponse.status).toBe(200);
    const consentJson = (await consentResponse.json()) as { redirect: boolean; url: string };
    expect(consentJson.redirect).toBe(true);
    const redirectUrl = new URL(consentJson.url);
    const code = redirectUrl.searchParams.get('code');
    expect(code).toBeTruthy();

    // 5. Token exchange, including `resource` so the token is a locally verifiable JWT scoped to
    // /mcp (see checkResource in oauth-provider — without `resource` the server issues an opaque
    // token instead).
    const tokenResponse = await fetch(`${baseURL}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code ?? '',
        redirect_uri: REDIRECT_URI,
        client_id: client.client_id,
        code_verifier: verifier,
        resource: `${baseURL}/mcp`,
      }).toString(),
    });

    expect(tokenResponse.status).toBe(200);
    const tokenJson = (await tokenResponse.json()) as { access_token: string; token_type: string };
    expect(tokenJson.token_type).toBe('Bearer');
    expect(tokenJson.access_token.split('.')).toHaveLength(3);

    // 6. Authenticated /mcp round trip: initialize, tools/list, publish_spec, get_artifact.
    const accessToken = tokenJson.access_token;

    const initResult = await mcpCall(accessToken, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'oauth-flow-int-test', version: '1.0.0' },
      },
    });

    expect(initResult.status).toBe(200);
    expect(initResult.json.result?.serverInfo?.name).toBe('exhibit');

    const toolsListResult = await mcpCall(accessToken, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    expect(toolsListResult.status).toBe(200);
    const toolNames = toolsListResult.json.result?.tools?.map((t) => t.name) ?? [];
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'publish_spec',
        'publish_html',
        'get_catalog',
        'update_artifact',
        'list_artifacts',
        'get_artifact',
        'delete_artifact',
      ]),
    );

    const publishResult = await mcpCall(accessToken, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'publish_spec',
        arguments: { title: 'OAuth E2E Doc', spec: itineraryFixture },
      },
    });

    expect(publishResult.status).toBe(200);
    expect(publishResult.json.result?.isError).toBeFalsy();
    const artifactId = publishResult.json.result?.structuredContent?.id as string;
    expect(artifactId).toBeTruthy();

    const getResult = await mcpCall(accessToken, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'get_artifact', arguments: { id: artifactId } },
    });

    expect(getResult.status).toBe(200);
    expect(getResult.json.result?.structuredContent?.title).toBe('OAuth E2E Doc');
  });

  it('rejects token exchange with the wrong PKCE code_verifier', async () => {
    const { clientId, code } = await authorizeAndGetCode();

    const tokenResponse = await fetch(`${baseURL}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: base64url(randomBytes(32)),
      }).toString(),
    });

    expect(tokenResponse.ok).toBe(false);
  });

  it('rejects token exchange with a mismatched redirect_uri', async () => {
    const { clientId, code, verifier } = await authorizeAndGetCode();

    const tokenResponse = await fetch(`${baseURL}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://evil.example.com/callback',
        client_id: clientId,
        code_verifier: verifier,
      }).toString(),
    });

    expect(tokenResponse.ok).toBe(false);
  });

  it('mints an opaque access token when the token request omits `resource`, and it authenticates at /mcp', async () => {
    const { clientId, code, verifier } = await authorizeAndGetCode();

    const tokenResponse = await fetch(`${baseURL}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier,
        // No `resource` param -> the provider issues an opaque token instead of a JWT (see the
        // comment on step 5 above).
      }).toString(),
    });

    expect(tokenResponse.status).toBe(200);
    const tokenJson = (await tokenResponse.json()) as { access_token: string; token_type: string };

    expect(tokenJson.token_type).toBe('Bearer');
    // A JWT has three dot-separated segments; an opaque token does not.
    expect(tokenJson.access_token.split('.')).not.toHaveLength(3);

    const toolsListResult = await mcpCall(tokenJson.access_token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    expect(toolsListResult.status).toBe(200);
    const toolNames = toolsListResult.json.result?.tools?.map((t) => t.name) ?? [];
    expect(toolNames).toEqual(expect.arrayContaining(['publish_spec', 'get_artifact']));
  });

  it('exchanges a refresh token for a new access token that authenticates at /mcp', async () => {
    // The provider only issues a refresh token when `offline_access` is among the granted scopes
    // (see createUserTokens in oauth-provider).
    const { clientId, code, verifier } = await authorizeAndGetCode('offline_access');

    const tokenResponse = await fetch(`${baseURL}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier,
        resource: `${baseURL}/mcp`,
      }).toString(),
    });

    expect(tokenResponse.status).toBe(200);
    const tokenJson = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
    };
    expect(tokenJson.refresh_token).toBeTruthy();

    const refreshResponse = await fetch(`${baseURL}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenJson.refresh_token ?? '',
        client_id: clientId,
        resource: `${baseURL}/mcp`,
      }).toString(),
    });

    expect(refreshResponse.status).toBe(200);
    const refreshJson = (await refreshResponse.json()) as { access_token: string };
    expect(refreshJson.access_token).toBeTruthy();

    const toolsListResult = await mcpCall(refreshJson.access_token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    expect(toolsListResult.status).toBe(200);
    const toolNames = toolsListResult.json.result?.tools?.map((t) => t.name) ?? [];
    expect(toolNames).toEqual(expect.arrayContaining(['publish_spec', 'get_artifact']));
  });

  it('rejects refresh-token reuse once the client registration is revoked', async () => {
    // A dedicated (not shared) client: this test deletes it, which must not affect the shared
    // client other cases in this file reuse.
    const { clientId, code, verifier } = await authorizeAndGetCode('offline_access', {
      freshClient: true,
    });

    const tokenResponse = await fetch(`${baseURL}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier,
        resource: `${baseURL}/mcp`,
      }).toString(),
    });

    const tokenJson = (await tokenResponse.json()) as { refresh_token?: string };
    expect(tokenJson.refresh_token).toBeTruthy();

    // Mirrors revokeMcpConnectionFn's deletion (see src/lib/account.ts): deleting the client
    // registration cascades (ON DELETE CASCADE) to its refresh tokens — the safety promise behind
    // the settings "Revoke" button.
    const { db } = await import('@/database');
    const { oauthClient } = await import('@/database/schemas/auth');
    const { eq } = await import('drizzle-orm');

    db.delete(oauthClient).where(eq(oauthClient.clientId, clientId)).run();

    const refreshResponse = await fetch(`${baseURL}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenJson.refresh_token ?? '',
        client_id: clientId,
        resource: `${baseURL}/mcp`,
      }).toString(),
    });

    expect(refreshResponse.ok).toBe(false);
    const refreshJson = (await refreshResponse.json()) as { access_token?: string };
    expect(refreshJson.access_token).toBeUndefined();
  });

  it('denying consent redirects with an oauth error instead of a code', async () => {
    const { cookie, consentUrl } = await authorizeToConsent();

    const consentResponse = await fetch(`${baseURL}/api/auth/oauth2/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ accept: false, oauth_query: consentUrl.search.slice(1) }),
    });

    expect(consentResponse.status).toBe(200);
    const consentJson = (await consentResponse.json()) as { redirect: boolean; url: string };
    const redirectUrl = new URL(consentJson.url);

    expect(redirectUrl.searchParams.get('code')).toBeNull();
    expect(redirectUrl.searchParams.get('error')).toBe('access_denied');
  });
});
