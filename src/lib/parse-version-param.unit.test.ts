import { describe, expect, it } from 'vitest';

import { parseVersionParam } from '@/lib/parse-version-param';

describe('parseVersionParam', () => {
  it('parses a valid positive integer', () => {
    expect(parseVersionParam('1')).toBe(1);
    expect(parseVersionParam('42')).toBe(42);
  });

  it('rejects non-numeric input', () => {
    expect(parseVersionParam('abc')).toBeUndefined();
  });

  it('rejects zero and negative numbers', () => {
    expect(parseVersionParam('0')).toBeUndefined();
    expect(parseVersionParam('-1')).toBeUndefined();
  });

  it('rejects values outside the safe integer range', () => {
    expect(parseVersionParam('1e21')).toBeUndefined();
  });
});
