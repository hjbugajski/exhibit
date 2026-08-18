/*
 * Calendar arithmetic for the gantt family, written out rather than delegated. Two reasons, both
 * contractual.
 *
 * Determinism: nothing in the core may read a clock, and `Date` is the clock. Even the parsing
 * constructors are unusable here — `new Date('2014-03-01')` is UTC while `new Date(2014, 2, 1)` is
 * local, so the same source would lay out a day apart either side of a meridian and a golden scene
 * would depend on the machine that produced it.
 *
 * No dependency: `src/lib/diagram` ships as a standalone core with no runtime dependency, which
 * rules out the date library mermaid itself leans on. What is actually needed is small — civil date
 * to instant and back, a weekday, a strict reader for a handful of format tokens, and a printer for
 * the axis — so it is here in full, on Howard Hinnant's `days_from_civil` algorithms.
 *
 * An instant is milliseconds from 1970-01-01T00:00, with no zone anywhere: a gantt source names wall
 * dates, and the drawing is the same picture whatever zone reads it.
 */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

export interface CivilDate {
  year: number;
  /** 1-12. */
  month: number;
  /** 1-31. */
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Days from 1970-01-01 to a proleptic Gregorian date. `month` is 1-12. */
export function epochDayFromCivil(year: number, month: number, day: number): number {
  const shifted = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;

  return era * 146_097 + dayOfEra - 719_468;
}

/** Inverse of `epochDayFromCivil`. */
export function civilFromEpochDay(epochDay: number): { year: number; month: number; day: number } {
  const shifted = epochDay + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth + (shiftedMonth < 10 ? 3 : -9);

  return { year: year + (month <= 2 ? 1 : 0), month, day };
}

/** Whole days since the epoch, floored, so a time of day never rounds a date up. */
export function epochDayOf(at: number): number {
  return Math.floor(at / MS_PER_DAY);
}

/** 0 is Sunday. 1970-01-01 was a Thursday, which is where the 4 comes from. */
export function dayOfWeek(epochDay: number): number {
  return (((epochDay + 4) % 7) + 7) % 7;
}

export function isWeekend(at: number): boolean {
  const weekday = dayOfWeek(epochDayOf(at));

  return weekday === 0 || weekday === 6;
}

export function civilOf(at: number): CivilDate {
  const epochDay = epochDayOf(at);
  const { year, month, day } = civilFromEpochDay(epochDay);
  const inDay = at - epochDay * MS_PER_DAY;

  return {
    year,
    month,
    day,
    hour: Math.floor(inDay / MS_PER_HOUR),
    minute: Math.floor(inDay / MS_PER_MINUTE) % 60,
    second: Math.floor(inDay / 1000) % 60,
  };
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

    return leap ? 29 : 28;
  }

  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

// -------------------------------------------------------------------------------- date formats

/** A `dateFormat` token, or a literal separator that must match the input exactly. */
type FormatPart =
  | { token: 'YYYY' | 'YY' | 'MM' | 'M' | 'DD' | 'D' | 'HH' | 'H' | 'mm' | 'ss' }
  | { literal: string };

/** Longest first: `MM` must win over `M`, and `YYYY` over `YY`. */
const TOKENS = ['YYYY', 'YY', 'MM', 'DD', 'HH', 'mm', 'ss', 'M', 'D', 'H'] as const;

export interface DateFormat {
  parts: readonly FormatPart[];
  /** Token-looking runs the reader does not know; the caller reports them and falls back. */
  unsupported: readonly string[];
}

/**
 * Splits a `dateFormat` into tokens and literals. Anything alphabetic that is not a known token is
 * collected rather than guessed at: silently reading `Do` as `D` would place a task on a date the
 * author never wrote.
 */
export function parseDateFormat(format: string): DateFormat {
  const parts: FormatPart[] = [];
  const unsupported: string[] = [];
  let literal = '';
  let index = 0;

  const flush = (): void => {
    if (literal) {
      parts.push({ literal });
      literal = '';
    }
  };

  while (index < format.length) {
    const token = TOKENS.find((candidate) => format.startsWith(candidate, index));

    if (token) {
      flush();
      parts.push({ token });
      index += token.length;
      continue;
    }

    const char = format[index] as string;

    if (/[A-Za-z]/.test(char)) {
      const run = /^[A-Za-z]+/.exec(format.slice(index))?.[0] as string;

      unsupported.push(run);
      index += run.length;
      continue;
    }

    literal += char;
    index += 1;
  }

  flush();

  return { parts, unsupported };
}

/** Digits a token consumes: a fixed width, or a one-or-two-digit range for the short forms. */
const WIDTHS: Readonly<Record<string, [min: number, max: number]>> = {
  YYYY: [4, 4],
  YY: [2, 2],
  MM: [2, 2],
  M: [1, 2],
  DD: [2, 2],
  D: [1, 2],
  HH: [2, 2],
  H: [1, 2],
  mm: [2, 2],
  ss: [2, 2],
};

/**
 * Reads `text` as an instant in `format`. Strict on purpose: every literal has to match, the whole
 * string has to be consumed, and the calendar has to accept the result — a task placed on the 31st
 * of February is a source bug the author would rather hear about than see drawn.
 */
export function parseDate(text: string, format: DateFormat): number | null {
  const input = text.trim();
  const fields: Record<string, number> = {};
  let at = 0;

  for (const part of format.parts) {
    if ('literal' in part) {
      if (!input.startsWith(part.literal, at)) {
        return null;
      }

      at += part.literal.length;
      continue;
    }

    const [min, max] = WIDTHS[part.token] as [number, number];
    const digits = /^\d+/.exec(input.slice(at))?.[0] ?? '';
    const taken = digits.slice(0, Math.min(max, digits.length));

    if (taken.length < min) {
      return null;
    }

    fields[part.token] = Number(taken);
    at += taken.length;
  }

  if (at !== input.length) {
    return null;
  }

  const year = fields.YYYY ?? (fields.YY === undefined ? undefined : 2000 + fields.YY);
  const month = fields.MM ?? fields.M ?? 1;
  const day = fields.DD ?? fields.D ?? 1;
  const hour = fields.HH ?? fields.H ?? 0;
  const minute = fields.mm ?? 0;
  const second = fields.ss ?? 0;

  if (year === undefined || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  return (
    epochDayFromCivil(year, month, day) * MS_PER_DAY +
    hour * MS_PER_HOUR +
    minute * MS_PER_MINUTE +
    second * 1000
  );
}

// --------------------------------------------------------------------------------- axis format

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** The `strftime` directives the axis printer knows. Mermaid's `axisFormat` is a d3 time format. */
const DIRECTIVES = new Set('YymdeBbAaHMSj%');

export interface AxisFormat {
  spec: string;
  unsupported: readonly string[];
}

/** Splits an `axisFormat` for its unknown directives; the spec itself is kept as written. */
export function parseAxisFormat(spec: string): AxisFormat {
  const unsupported: string[] = [];

  for (const [, directive] of spec.matchAll(/%(.)/g)) {
    if (!DIRECTIVES.has(directive as string)) {
      unsupported.push(`%${directive as string}`);
    }
  }

  return { spec, unsupported };
}

/** Formats an instant with the supported `strftime` directives; an unknown one prints literally. */
export function formatInstant(at: number, spec: string): string {
  const date = civilOf(at);
  const weekday = dayOfWeek(epochDayOf(at));

  return spec.replaceAll(/%(.)/g, (whole, directive: string) => {
    switch (directive) {
      case 'Y':
        return String(date.year);
      case 'y':
        return pad(((date.year % 100) + 100) % 100);
      case 'm':
        return pad(date.month);
      case 'B':
        return MONTHS_LONG[date.month - 1] as string;
      case 'b':
        return MONTHS_SHORT[date.month - 1] as string;
      case 'd':
        return pad(date.day);
      case 'e':
        return String(date.day);
      case 'A':
        return DAYS_LONG[weekday] as string;
      case 'a':
        return DAYS_SHORT[weekday] as string;
      case 'H':
        return pad(date.hour);
      case 'M':
        return pad(date.minute);
      case 'S':
        return pad(date.second);
      case 'j':
        return pad(epochDayOf(at) - epochDayFromCivil(date.year, 1, 1) + 1, 3);
      case '%':
        return '%';
      default:
        return whole;
    }
  });
}

// ----------------------------------------------------------------------------------- durations

/** Midnight of the day `at` falls in. */
export function startOfDay(at: number): number {
  return epochDayOf(at) * MS_PER_DAY;
}

/** The first instant from `at` onward that is not on an excluded day. */
export function skipExcluded(at: number, excludeWeekends: boolean): number {
  if (!excludeWeekends) {
    return at;
  }

  let moved = at;

  while (isWeekend(moved)) {
    moved = startOfDay(moved) + MS_PER_DAY;
  }

  return moved;
}

/**
 * `start` plus a duration. A duration in whole days walks the calendar a day at a time so excluded
 * days can be stepped over — that is what makes `excludes weekends` extend a bar across a weekend
 * rather than eat two days of it. A sub-day duration is added flat: a two-hour task does not
 * meaningfully straddle a weekend, and walking it by the hour would be arithmetic theatre.
 */
export function addDuration(
  start: number,
  duration: { ms: number; days: number | null },
  excludeWeekends: boolean,
): number {
  if (duration.days === null || !excludeWeekends) {
    return start + duration.ms;
  }

  let at = start;
  let remaining = duration.days;

  while (remaining > 0) {
    at = skipExcluded(at, excludeWeekends) + MS_PER_DAY;
    remaining -= 1;
  }

  return at;
}
