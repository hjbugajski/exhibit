/*
 * The React half of the extraction seam, enforced the way `src/lib/diagram` enforces its own.
 * Everything in this folder except `house-diagram.tsx` is library code: it may reach for the core
 * and for `@/lib/*` helpers, and for nothing under `@/components`. `house-diagram.tsx` is the one
 * binding, and it is where an app import belongs.
 *
 * Prose said this before a test did, which cost nothing and caught nothing.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const BINDING = 'house-diagram.tsx';

const files = readdirSync(import.meta.dirname)
  .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.') && name !== BINDING)
  .sort();

/** Every `from '…'`, `import '…'` and `import('…')` specifier in the file. */
function importsOf(source: string): string[] {
  const pattern = /\bfrom\s+'([^']+)'|\bimport\s*\(\s*'([^']+)'|\bimport\s+'([^']+)'/g;

  return [...source.matchAll(pattern)].map((match) => match[1] ?? match[2] ?? match[3] ?? '');
}

describe('extraction seam', () => {
  it('finds the library sources', () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files).not.toContain(BINDING);
  });

  it.each(files)('%s imports no app component', (file) => {
    const specifiers = importsOf(readFileSync(join(import.meta.dirname, file), 'utf8'));

    for (const specifier of specifiers) {
      expect(
        specifier.startsWith('@/components/'),
        `${file} imports ${specifier}; app code belongs in ${BINDING}`,
      ).toBe(false);
    }
  });
});
