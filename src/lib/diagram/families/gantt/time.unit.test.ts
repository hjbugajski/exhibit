import { describe, expect, it } from 'vitest';

import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  addDuration,
  epochDayFromCivil,
  skipExcluded,
} from './time.ts';

/** The day-at-a-time walk `addDuration` replaced, kept as the parity oracle. */
function walk(start: number, days: number): number {
  let at = start;

  for (let remaining = days; remaining > 0; remaining -= 1) {
    at = skipExcluded(at, true) + MS_PER_DAY;
  }

  return at;
}

const monday = epochDayFromCivil(2024, 3, 4) * MS_PER_DAY;

describe('addDuration with weekends excluded', () => {
  const starts = Array.from({ length: 7 }, (_, offset) => monday + offset * MS_PER_DAY).flatMap(
    (day) => [day, day + 13 * MS_PER_HOUR + 30 * MS_PER_MINUTE],
  );

  it('matches the day-at-a-time walk for every weekday and time of day', () => {
    for (const start of starts) {
      for (let days = 0; days <= 40; days += 1) {
        expect(
          addDuration(start, { ms: days * MS_PER_DAY, days }, true),
          `${start} + ${days}d`,
        ).toBe(walk(start, days));
      }
    }
  });

  it('jumps whole weeks for a very long duration', () => {
    const days = 5_000_000;

    expect(addDuration(monday, { ms: days * MS_PER_DAY, days }, true)).toBe(
      monday + 6_999_998 * MS_PER_DAY,
    );
  });
});
