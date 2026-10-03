import { describe, expect, it } from 'vitest';

import { ALLOWED_FAMILIES } from '@/catalog/mermaid-schema';
import { builtinFamilies } from '@/lib/diagram/family';

describe('ALLOWED_FAMILIES', () => {
  it('lists the builtin families as prose, in registration order', () => {
    expect(ALLOWED_FAMILIES).toBe('flowchart, sequence, state, class, ER, pie, and gantt');
  });

  it.each(builtinFamilies.map((family) => family.id))('names the %s family', (id) => {
    expect(ALLOWED_FAMILIES).toContain(id === 'er' ? 'ER' : id);
  });
});
