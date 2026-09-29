const BASE = 'http://exhibit.invalid';
const BASE_ORIGIN = new URL(BASE).origin;

/**
 * Returns `value` when it is a root-relative path that resolves to this
 * origin, else `undefined`. Prefix checks are unsound: WHATWG parsing maps `\`
 * to `/` and strips tabs and newlines, so only a post-parse origin comparison
 * matches what the browser will navigate to.
 */
export function sameOriginPath(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    new URL(value, BASE).origin === BASE_ORIGIN
    ? value
    : undefined;
}
