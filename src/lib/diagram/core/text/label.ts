/*
 * Mermaid label text, shared by every family parser. In order: strip one matching quote pair, decode
 * the fixed entity set, split on explicit breaks, trim each line, collapse internal whitespace.
 *
 * Nothing else — no HTML parsing, no markdown, no entity table beyond the map. Anything the grammar
 * would otherwise eat has an entity spelling, so a label never needs an escape mechanism.
 */

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  colon: ':',
  equals: '=',
  gt: '>',
  hash: '#',
  lt: '<',
  quot: '"',
  semi: ';',
};

const ENTITY = /#(\w+);/g;
const BREAK = /<br\s*\/?>|\\n/gi;

/** Mermaid's entity syntax is `#name;` / `#NN;`, not the HTML ampersand form. */
export function decodeEntities(raw: string): string {
  return raw.replace(ENTITY, (whole, name: string) => {
    if (!/^\d+$/.test(name)) {
      return ENTITIES[name] ?? whole;
    }

    const code = Number(name);

    return code >= 0 && code <= 0x10_ff_ff ? String.fromCodePoint(code) : whole;
  });
}

/** Removes one matching pair of double quotes, which is all mermaid allows. */
export function stripQuotes(raw: string): string {
  const text = raw.trim();

  return text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
}

/**
 * Decoded text as the lines it will be drawn on. Whitespace-only lines are dropped, so `" "` is a
 * label with no text rather than a blank line reserving height. Quotes are already gone by here —
 * a family that strips its own delimiters first calls this rather than `labelLines`.
 */
export function splitLines(text: string): string[] {
  return decodeEntities(text)
    .split(BREAK)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 0);
}

/** The whole reader: one quote pair off, then `splitLines`. */
export function labelLines(raw: string): string[] {
  return splitLines(stripQuotes(raw));
}
