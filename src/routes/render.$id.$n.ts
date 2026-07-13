import { createFileRoute } from '@tanstack/react-router';

import { requestLog } from '@/lib/request-log';
import { resolveArtifactVersion } from '@/lib/resolve-artifact-version';

/**
 * CSP for HTML artifacts, which open as their own top-level page. They are hostile (arbitrary
 * AI-authored script), so the `sandbox allow-scripts` directive is the security boundary: the
 * document runs with an opaque origin (never same-origin with the app), exactly like an iframe
 * `sandbox="allow-scripts"` attribute but enforced by the response itself wherever it is opened.
 * `frame-ancestors 'none'` is defense in depth on top of that: nothing - not even our own origin -
 * may ever iframe this document. The rest is defense in depth too: no same-origin network access
 * (`connect-src 'none'`), scripts/styles limited to inline or the one CDN `publish_html`'s prompt
 * allows, images/fonts from any https host or data:.
 */
export const RENDER_CSP =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://cdnjs.cloudflare.com; img-src https: data:; font-src https: data:; connect-src 'none'; frame-ancestors 'none'";

async function handleGet({
  request,
  params,
}: {
  request: Request;
  params: { id: string; n: string };
}): Promise<Response> {
  requestLog()?.set({ artifact: { id: params.id, n: params.n } });

  // Session check happens here, not in the `_authed` beforeLoad guard: this route serves a raw
  // document, so an unauthenticated request gets a bare 401 instead of an HTML sign-in redirect.
  const resolved = await resolveArtifactVersion(request, params);

  if (!resolved.ok) {
    return resolved.response;
  }

  if (resolved.artifact.type !== 'html') {
    return new Response(null, { status: 404 });
  }

  return new Response(resolved.version.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': RENDER_CSP,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const Route = createFileRoute('/render/$id/$n')({
  server: { handlers: { GET: handleGet } },
});
