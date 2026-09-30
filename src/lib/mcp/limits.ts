/** Shared 1 MB cap on every artifact body (spec, HTML, markdown) submitted through MCP tools. */
export const MAX_BODY_BYTES = 1_000_000;

/**
 * Returns an explicit isError-ready message when `serialized` exceeds the
 * cap, or `null` when it's within limits.
 */
export function checkBodySize(serialized: string, label: string): string | null {
  const bytes = Buffer.byteLength(serialized, 'utf8');

  if (bytes <= MAX_BODY_BYTES) {
    return null;
  }

  return `The ${label} body is ${bytes.toLocaleString()} bytes, which exceeds the ${MAX_BODY_BYTES.toLocaleString()}-byte (1 MB) limit. Shorten the body, or split the content across several artifacts.`;
}
