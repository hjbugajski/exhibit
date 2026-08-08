import { describe, expect, it } from 'vitest';

import { buildProtomapsStyle } from '@/components/ui/map/protomaps-style';

describe('buildProtomapsStyle', () => {
  it('reuses one style object per flavor and key', () => {
    expect(buildProtomapsStyle('dark', 'key-a')).toBe(buildProtomapsStyle('dark', 'key-a'));
  });

  it('builds a distinct style per flavor and per key', () => {
    const dark = buildProtomapsStyle('dark', 'key-a');

    expect(buildProtomapsStyle('light', 'key-a')).not.toBe(dark);
    expect(buildProtomapsStyle('dark', 'key-b')).not.toBe(dark);
  });
});
