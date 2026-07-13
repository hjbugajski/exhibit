import { createFileRoute } from '@tanstack/react-router';
import { sql } from 'drizzle-orm';

import { db } from '@/database';
import { requestLog } from '@/lib/request-log';

export const Route = createFileRoute('/healthz')({
  server: {
    handlers: {
      GET: async () => {
        try {
          db.get(sql`select 1`);
        } catch (error) {
          requestLog()?.error(error as Error);

          return Response.json({ status: 'error' }, { status: 503 });
        }

        return Response.json(
          { status: 'ok', db: true },
          { headers: { 'cache-control': 'no-store' } },
        );
      },
    },
  },
});
