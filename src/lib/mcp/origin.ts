import { createServerFn } from '@tanstack/react-start';

import { env } from '@/lib/env';
import { sessionMiddleware } from '@/lib/session-middleware';

/**
 * The URL an MCP client connects to, on the canonical public origin (`BASE_URL`), so the docs page
 * shows the same value server- and client-rendered regardless of how the app was reached.
 */
export const getMcpConnectUrlFn = createServerFn({ method: 'GET' })
  .middleware([sessionMiddleware])
  .handler(() => `${env.BASE_URL}/mcp`);
