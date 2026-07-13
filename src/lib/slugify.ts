/**
 * Lowercases and collapses non-alphanumeric runs to single hyphens (ASCII only); can return '' —
 * e.g. for all-symbol input.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
