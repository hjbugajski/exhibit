import { describe, expect, it } from 'vitest';

import { catalog } from '@/catalog/catalog';
import { kitchenSinkFixture } from '@/catalog/fixtures/kitchen-sink';

describe('kitchenSinkFixture', () => {
  it('uses every catalog component at least once', () => {
    const usedTypes = new Set(
      Object.values(kitchenSinkFixture.elements).map((element) => element.type),
    );
    const catalogTypes = Object.keys(catalog.data.components);

    expect(catalogTypes.filter((type) => !usedTypes.has(type))).toEqual([]);
  });
});
