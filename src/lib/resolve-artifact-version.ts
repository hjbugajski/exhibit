import { db } from '@/database';
import type { Artifact, ArtifactVersion } from '@/database/repository';
import { getArtifact } from '@/database/repository';
import { parseVersionParam } from '@/lib/parse-version-param';
import { getSessionForRequest } from '@/lib/request-session';

export type ArtifactVersionResolution =
  | { ok: true; artifact: Artifact; version: ArtifactVersion; versionNumber: number }
  | { ok: false; response: Response };

/**
 * Shared session-check -> version-validate -> lookup pipeline for the raw /render and /download
 * routes, which are otherwise identical up to this point. Each route builds its own response
 * body/headers from the resolved artifact - callers own the `ok: false` response verbatim
 * (status/shape is the same 401/400/404 both routes already returned before this was extracted).
 */
export async function resolveArtifactVersion(
  request: Request,
  params: { id: string; n: string },
): Promise<ArtifactVersionResolution> {
  const session = await getSessionForRequest(request);

  if (!session) {
    return { ok: false, response: new Response(null, { status: 401 }) };
  }

  const versionNumber = parseVersionParam(params.n);

  if (versionNumber === undefined) {
    return { ok: false, response: new Response(null, { status: 400 }) };
  }

  const result = getArtifact(db, params.id, versionNumber);

  if (!result) {
    return { ok: false, response: new Response(null, { status: 404 }) };
  }

  return { ok: true, artifact: result.artifact, version: result.version, versionNumber };
}
