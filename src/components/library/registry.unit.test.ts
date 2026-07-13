// @vitest-environment happy-dom
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { catalog } from '@/catalog/catalog';
import { libraryDemos } from '@/components/library/registry';

/** ui/ entries that share one demo page instead of mapping 1:1 to a slug. */
const SLUG_ALIASES: Record<string, string> = {
  field: 'forms',
  form: 'forms',
  input: 'forms',
  label: 'forms',
  textarea: 'forms',
};

/** Catalog components that share one demo page (Day/Stop only exist inside an Itinerary). */
const CATALOG_ALIASES: Record<string, string> = {
  Day: 'catalog-itinerary',
  Stop: 'catalog-itinerary',
};

function kebab(name: string): string {
  return name.replace(/(?<=[a-z])(?=[A-Z])/g, '-').toLowerCase();
}

describe('library registry', () => {
  it('has no duplicate slugs', () => {
    const slugs = libraryDemos.map((demo) => demo.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has a demo for every src/components/ui entry', () => {
    // Built from the module path string; happy-dom's global URL class breaks fileURLToPath.
    const uiDir = join(dirname(fileURLToPath(import.meta.url)), '../ui');
    const expected = new Set(
      readdirSync(uiDir, { withFileTypes: true }).map((entry) => {
        const name = entry.isDirectory() ? entry.name : entry.name.replace(/\.tsx$/, '');

        return SLUG_ALIASES[name] ?? name;
      }),
    );
    const slugs = new Set(libraryDemos.map((demo) => demo.slug));
    const missing = [...expected].filter((slug) => !slugs.has(slug));

    expect(missing).toEqual([]);
  });

  it('has a demo for every catalog component', () => {
    const expected = new Set(
      Object.keys(catalog.data.components).map(
        (name) => CATALOG_ALIASES[name] ?? `catalog-${kebab(name)}`,
      ),
    );
    const slugs = new Set(libraryDemos.map((demo) => demo.slug));
    const missing = [...expected].filter((slug) => !slugs.has(slug));

    expect(missing).toEqual([]);
  });
});
