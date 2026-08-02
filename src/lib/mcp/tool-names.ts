/**
 * The MCP tool surface, in registration order. Single source of truth for the three places that
 * list the tools: `server.ts` registers exactly these names (asserted by server.int.test.ts),
 * `docs-view.tsx` types its table as an exhaustive record over them, and README's table is prose.
 * Client-safe on purpose — `server.ts` pulls in drizzle and env, so client code imports this.
 */
export const MCP_TOOL_NAMES = [
  'publish_spec',
  'publish_html',
  'get_catalog',
  'update_artifact',
  'list_artifacts',
  'list_tags',
  'get_artifact',
  'set_artifact_archived',
  'delete_artifact',
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];
