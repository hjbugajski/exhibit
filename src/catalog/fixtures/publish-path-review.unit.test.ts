import { describe, expect, it } from 'vitest';

import { publishPathReviewFixture } from '@/catalog/fixtures/publish-path-review';
import { validateArtifactSpec } from '@/catalog/validate';
import { buildDiagram } from '@/lib/diagram/build';
import { metricsMeasurer } from '@/lib/diagram/core/text/measurers';

/** Every Mermaid block in the fixture, in document order, keyed by element id. */
const sources = new Map(
  Object.entries(publishPathReviewFixture.elements)
    .filter(([, element]) => element.type === 'Mermaid')
    .map(([id, element]) => [id, (element.props as { code: string }).code] as const),
);

/** The one family the engine recognizes but defers — it falls back to mermaid.js in the app. */
const DEFERRED = 'rollout-diagram';

describe('publishPathReviewFixture', () => {
  it('is a valid artifact spec', () => {
    expect(validateArtifactSpec(publishPathReviewFixture).valid).toBe(true);
  });

  it('carries the diagram families the review is meant to exercise', () => {
    expect([...sources.keys()]).toEqual([
      'request-diagram',
      'lifecycle-diagram',
      'exchange-diagram',
      'mix-diagram',
      DEFERRED,
    ]);
  });

  it.each([...sources].filter(([id]) => id !== DEFERRED))('draws %s cleanly', (_id, code) => {
    const { scene, diagnostics } = buildDiagram(code, { measurer: metricsMeasurer });

    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(scene).not.toBeNull();
  });

  it('leaves the gantt to the mermaid.js fallback', () => {
    const { scene, diagnostics } = buildDiagram(sources.get(DEFERRED) ?? '', {
      measurer: metricsMeasurer,
    });

    expect(scene).toBeNull();
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('unsupported-diagram-type');
  });
});
