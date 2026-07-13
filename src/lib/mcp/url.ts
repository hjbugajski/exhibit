import { env } from '@/lib/env';

/** Public URL an owner would open to view an artifact. */
export function artifactUrl(id: string): string {
  return `${env.BASE_URL}/a/${id}`;
}
