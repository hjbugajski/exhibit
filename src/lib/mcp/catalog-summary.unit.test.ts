import { describe, expect, it } from 'vitest';

import { validateArtifactSpec } from '@/catalog/validate';
import { buildCatalogSummary, EXAMPLE_SPECS } from '@/lib/mcp/catalog-summary';

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
    expect(text).toContain('statePath');
  });
});

describe('EXAMPLE_SPECS', () => {
  it.each(EXAMPLE_SPECS)('$label passes the publish-time validator', ({ spec }) => {
    const result = validateArtifactSpec(spec);

    expect(result.valid ? [] : result.errors).toEqual([]);
  });
});
