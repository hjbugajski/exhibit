/*
 * The two sentence-building rules every text alternative shares: plurals, and where a detail list
 * stops being useful. They live here rather than in `describe.ts` because a family's own describer
 * (gantt's) needs them too, and importing them back out of `describe.ts` — which imports the family
 * describers — would be a cycle.
 */

/** Detail lines before the tail becomes a count. Roughly one screen of a browse-mode list. */
export const MAX_DETAILS = 40;

export function count(n: number, singular: string): string {
  return `${n} ${n === 1 ? singular : `${singular}s`}`;
}

export function capped(lines: readonly string[], noun: string): string[] {
  if (lines.length <= MAX_DETAILS) {
    return [...lines];
  }

  return [
    ...lines.slice(0, MAX_DETAILS),
    `…and ${count(lines.length - MAX_DETAILS, `more ${noun}`)}.`,
  ];
}
