import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createFileRoute } from '@tanstack/react-router';

import { db } from '@/database';
import { verifyMcpBearer } from '@/lib/mcp/auth';
import { buildMcpServer } from '@/lib/mcp/server';
import { requestLog } from '@/lib/request-log';

async function handlePost({ request }: { request: Request }): Promise<Response> {
  const auth = await verifyMcpBearer(request);

  requestLog()?.set({ auth: { ok: auth.ok, subject: auth.ok ? auth.subject : undefined } });

  if (!auth.ok) {
    return new Response(null, {
      status: auth.status,
      headers: { 'WWW-Authenticate': auth.wwwAuthenticate },
    });
  }

  // Stateless JSON mode: a fresh server + transport per request, per the MCP streamable HTTP spec's
  // stateless pattern.
  const server = buildMcpServer(db);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  return transport.handleRequest(request);
}

function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      POST: handlePost,
      GET: methodNotAllowed,
      DELETE: methodNotAllowed,
    },
  },
});
