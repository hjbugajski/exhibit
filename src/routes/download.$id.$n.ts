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
      // Belt-and-braces mirror of /render's header: an attachment never becomes a document, so
      // this is inert today, but the two artifact-serving routes stay header-identical.
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export const Route = createFileRoute('/download/$id/$n')({
  server: { handlers: { GET: handleGet } },
});
