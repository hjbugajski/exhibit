import { env } from '@/lib/env';

/** URL the owner opens to view an artifact; it requires their gallery session, so it is not shareable. */
export function artifactUrl(id: string): string {
  return `${env.BASE_URL}/a/${id}`;
}
