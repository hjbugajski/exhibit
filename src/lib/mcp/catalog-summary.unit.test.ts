import { describe, expect, it } from 'vitest';

import { buildCatalogSummary } from '@/lib/mcp/catalog-summary';

describe('buildCatalogSummary', () => {
  it('stays within the ~4k token budget (chars/4 heuristic)', () => {
    const { text } = buildCatalogSummary();
    const approxTokens = text.length / 4;

    expect(approxTokens).toBeLessThan(4000);
  });

  it('includes the wire format reminder, every component name, and example specs', () => {
    const { text } = buildCatalogSummary();

    expect(text).toContain('WIRE FORMAT');
    expect(text).toContain('## Table');
    expect(text).toContain('## Itinerary');
    expect(text).toContain('### Itinerary (multi-day trip)');
    expect(text).toContain('### Comparison');
  });
});
