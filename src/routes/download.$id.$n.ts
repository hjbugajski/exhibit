import { createFileRoute } from '@tanstack/react-router';

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
  const isSpec = artifact.type === 'spec';
  const body = isSpec ? prettyPrintSpec(version.body) : version.body;
  const filename = `${slugify(artifact.title) || artifact.id}-v${versionNumber}.${isSpec ? 'json' : 'html'}`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': isSpec ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const Route = createFileRoute('/download/$id/$n')({
  server: { handlers: { GET: handleGet } },
});
