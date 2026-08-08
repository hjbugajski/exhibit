/**
 * A minimal OAuth 2.1 client for driving this app's real Better Auth + oauth-provider endpoints:
 * dynamic client registration -> sign in -> PKCE authorize -> consent -> token exchange. Shared by
 * the in-process integration suite (src/lib/mcp/oauth-flow.int.test.ts) and the E2E publish script
 * (scripts/dev-publish.ts) so a Better Auth response-shape change breaks the test suite loudly
 * instead of only the script, opaquely.
 *
 * Constraint: scripts/dev-publish.ts runs under plain `node` with native type stripping, so this
 * module must stay on relative imports (none needed today) and erasable TS syntax only.
 */
import { createHash, randomBytes } from 'node:crypto';

type FetchLike = typeof fetch;

export function base64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());

  return { verifier, challenge };
}

/** Collapses Set-Cookie response headers into a single request Cookie header. */
export function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((raw) => raw.split(';')[0])
    .join('; ');
}

/** Dynamic client registration for a public, PKCE-only client. */
export async function registerClient(options: {
  baseURL: string;
  redirectUri: string;
  clientName: string;
  fetch?: FetchLike;
}): Promise<string> {
  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(`${options.baseURL}/api/auth/oauth2/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: options.baseURL },
    body: JSON.stringify({
      redirect_uris: [options.redirectUri],
      token_endpoint_auth_method: 'none',
      client_name: options.clientName,
    }),
  });

  if (!response.ok) {
    throw new Error(`client registration failed: ${response.status}`);
  }

  const client = (await response.json()) as { client_id: string };

  return client.client_id;
}

/** Signs in as the owner and returns the session Cookie header for subsequent calls. */
export async function signIn(options: {
  baseURL: string;
  email: string;
  password: string;
  fetch?: FetchLike;
}): Promise<string> {
  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(`${options.baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: options.baseURL },
    body: JSON.stringify({ email: options.email, password: options.password }),
  });

  if (!response.ok) {
    throw new Error(`sign-in failed: ${response.status}`);
  }

  return cookieHeader(response);
}

/** A PKCE S256 authorize URL, with an optional `scope` and `prompt`. */
export function buildAuthorizeUrl(params: {
  baseURL: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  scope?: string;
  prompt?: string;
}): URL {
  const authorizeUrl = new URL(`${params.baseURL}/api/auth/oauth2/authorize`);

  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', params.clientId);
  authorizeUrl.searchParams.set('redirect_uri', params.redirectUri);
  authorizeUrl.searchParams.set('code_challenge', params.challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('state', base64url(randomBytes(16)));

  if (params.scope) {
    authorizeUrl.searchParams.set('scope', params.scope);
  }

  if (params.prompt) {
    authorizeUrl.searchParams.set('prompt', params.prompt);
  }

  return authorizeUrl;
}

/**
 * Authorizes with PKCE and stops at the consent screen, returning the verifier that matches the
 * challenge plus the consent URL to submit. `Accept: application/json` makes the endpoint return
 * `{redirect, url}` JSON instead of an HTTP redirect (see @better-auth/oauth-provider's
 * `handleRedirect`), which is easier to drive from a client than following a 302.
 */
export async function authorizeToConsent(options: {
  baseURL: string;
  clientId: string;
  cookie: string;
  redirectUri: string;
  scope?: string;
  prompt?: string;
  fetch?: FetchLike;
}): Promise<{ verifier: string; consentUrl: URL }> {
  const doFetch = options.fetch ?? fetch;
  const { verifier, challenge } = pkcePair();
  const authorizeUrl = buildAuthorizeUrl({
    baseURL: options.baseURL,
    clientId: options.clientId,
    redirectUri: options.redirectUri,
    challenge,
    scope: options.scope,
    prompt: options.prompt,
  });

  const response = await doFetch(authorizeUrl, {
    headers: { cookie: options.cookie, accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`authorize failed: ${response.status}`);
  }

  const authorizeJson = (await response.json()) as { url: string };

  return { verifier, consentUrl: new URL(authorizeJson.url, options.baseURL) };
}

/**
 * Submits (or denies) consent — the consent page's own query string re-submitted with its embedded
 * signature, exactly what src/routes/consent.tsx does — and returns the client redirect URL, which
 * carries either a `code` or an `error`.
 */
export async function submitConsent(options: {
  baseURL: string;
  cookie: string;
  consentUrl: URL;
  accept: boolean;
  fetch?: FetchLike;
}): Promise<URL> {
  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(`${options.baseURL}/api/auth/oauth2/consent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: options.cookie,
      origin: options.baseURL,
    },
    body: JSON.stringify({
      accept: options.accept,
      oauth_query: options.consentUrl.search.slice(1),
    }),
  });

  if (!response.ok) {
    throw new Error(`consent failed: ${response.status}`);
  }

  const consentJson = (await response.json()) as { url: string };

  return new URL(consentJson.url);
}

/**
 * The whole dance in one call: DCR -> sign in -> PKCE authorize -> consent -> token exchange,
 * returning an access token for `${baseURL}/mcp`. `resource` is sent so the provider mints a
 * locally verifiable JWT rather than an opaque token (see checkResource in oauth-provider).
 */
export async function getAccessToken(options: {
  baseURL: string;
  email: string;
  password: string;
  redirectUri: string;
  clientName?: string;
  fetch?: FetchLike;
}): Promise<string> {
  const { baseURL, redirectUri } = options;
  const doFetch = options.fetch ?? fetch;

  const clientId = await registerClient({
    baseURL,
    redirectUri,
    clientName: options.clientName ?? 'exhibit-oauth-client',
    fetch: doFetch,
  });
  const cookie = await signIn({
    baseURL,
    email: options.email,
    password: options.password,
    fetch: doFetch,
  });
  const { verifier, consentUrl } = await authorizeToConsent({
    baseURL,
    clientId,
    cookie,
    redirectUri,
    fetch: doFetch,
  });
  const redirectUrl = await submitConsent({
    baseURL,
    cookie,
    consentUrl,
    accept: true,
    fetch: doFetch,
  });
  const code = redirectUrl.searchParams.get('code');

  if (!code) {
    throw new Error('no authorization code returned');
  }

  const tokenResponse = await doFetch(`${baseURL}/api/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: baseURL },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
      resource: `${baseURL}/mcp`,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error(`token exchange failed: ${tokenResponse.status}`);
  }

  const tokenJson = (await tokenResponse.json()) as { access_token: string };

  return tokenJson.access_token;
}
