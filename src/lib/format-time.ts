const UNITS: { limit: number; divisor: number; unit: string }[] = [
  { limit: 3_600_000, divisor: 60_000, unit: 'm' },
  { limit: 86_400_000, divisor: 3_600_000, unit: 'h' },
  { limit: 2_592_000_000, divisor: 86_400_000, unit: 'd' },
  { limit: 31_536_000_000, divisor: 2_592_000_000, unit: 'mo' },
];

/** Formats a past timestamp (ms epoch) as a short relative string, e.g. "3h ago". */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - timestamp);

  if (diff < 60_000) {
    return 'just now';
  }

  for (const { limit, divisor, unit } of UNITS) {
    if (diff < limit) {
      return `${Math.floor(diff / divisor)}${unit} ago`;
    }
  }

  return `${Math.floor(diff / 31_536_000_000)}y ago`;
}
