import { createFileRoute } from '@tanstack/react-router';

import type { ArtifactType } from '@/database/repository';
import { requestLog } from '@/lib/request-log';
import { resolveArtifactVersion } from '@/lib/resolve-artifact-version';
import { slugify } from '@/lib/slugify';

function prettyPrintSpec(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body) as unknown, null, 2);
  } catch {
    return body;
  }
}

/**
 * How each artifact type leaves the app as a file. `prepare` reshapes the stored body for download
 * (spec bodies are stored minified); types without one download byte-for-byte.
 */
const downloadFormats: Record<
  ArtifactType,
  { ext: string; contentType: string; prepare?: (body: string) => string }
> = {
  spec: { ext: 'json', contentType: 'application/json; charset=utf-8', prepare: prettyPrintSpec },
  html: { ext: 'html', contentType: 'text/html; charset=utf-8' },
  markdown: { ext: 'md', contentType: 'text/markdown; charset=utf-8' },
};

/**
 * `Content-Disposition: attachment` is the primary control: the browser saves the file and never
 * renders it. This CSP applies only if a client renders the response inline instead, and then the
 * hostile body runs no script, gets an opaque origin, and loads no subresources. A route CSP
 * replaces the security-headers plugin baseline, so `frame-ancestors 'none'` restates it.
 */
const DOWNLOAD_CSP = "sandbox; default-src 'none'; frame-ancestors 'none'";

async function handleGet({
  request,
  params,
}: {
  request: Request;
  params: { id: string; n: string };
}): Promise<Response> {
  requestLog()?.set({ artifact: { id: params.id, n: params.n } });

  const resolved = await resolveArtifactVersion(request, params);

  if (!resolved.ok) {
    return resolved.response;
  }

  const { artifact, version, versionNumber } = resolved;
  const format = downloadFormats[artifact.type];
  const body = format.prepare ? format.prepare(version.body) : version.body;
  const filename = `${slugify(artifact.title) || artifact.id}-v${versionNumber}.${format.ext}`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': format.contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': DOWNLOAD_CSP,
      // Like the CSP, this matters only if a client renders the response inline: the document then
      // does not leak the gallery URL to the remote hosts its markup references.
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export const Route = createFileRoute('/download/$id/$n')({
  server: { handlers: { GET: handleGet } },
});
