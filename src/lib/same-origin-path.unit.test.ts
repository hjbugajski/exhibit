import { describe, expect, it } from 'vitest';

import { sameOriginPath } from '@/lib/same-origin-path';

describe('sameOriginPath', () => {
  it('rejects a backslash path that browsers resolve off-origin', () => {
    expect(sameOriginPath('/\\evil.com')).toBeUndefined();
  });

  it('accepts root-relative paths', () => {
    expect(sameOriginPath('/')).toBe('/');
    expect(sameOriginPath('/a/xyz')).toBe('/a/xyz');
    expect(sameOriginPath('/a/xyz?x=1#h')).toBe('/a/xyz?x=1#h');
  });

  it('returns a consent path with an encoded redirect_uri unchanged', () => {
    const path = '/consent?client_id=c&redirect_uri=https%3A%2F%2Fexample.com%2Fcb';

    expect(sameOriginPath(path)).toBe(path);
  });

  it('rejects protocol-relative, absolute, and bare relative values', () => {
    expect(sameOriginPath('//evil.com')).toBeUndefined();
    expect(sameOriginPath('https://evil.com')).toBeUndefined();
    expect(sameOriginPath('javascript:alert(1)')).toBeUndefined();
    expect(sameOriginPath('evil.com')).toBeUndefined();
  });

  it('rejects a path whose tab is stripped into a protocol-relative URL', () => {
    expect(sameOriginPath('/\t/evil.com')).toBeUndefined();
  });

  it('rejects non-strings', () => {
    expect(sameOriginPath(undefined)).toBeUndefined();
    expect(sameOriginPath(42)).toBeUndefined();
    expect(sameOriginPath(['/a'])).toBeUndefined();
  });
});
