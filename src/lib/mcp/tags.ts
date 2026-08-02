/**
 * Trims, drops empties, and dedupes a tag list, preserving first-seen order. Double quotes are
 * stripped rather than rejected: they have no legitimate use in a tag, and MCP callers shouldn't
 * get an error for one.
 */
export function normalizeTags(tags?: string[]): string[] {
  if (!tags) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.replaceAll('"', '').trim();

    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}
