/*
 * The extraction seam. `src/lib/diagram` must stay a standalone package-quality core: relative
 * imports only, no `@/`, no react, no runtime dependency. Tests are exempt from the package rule
 * (they import vitest and node builtins) but not from the `@/` rule.
 *
 * The NUL guard at the bottom is repo-wide rather than core-only: it is a tooling property, not a
 * packaging one, and the whole repo pays when it is broken.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '.');
const repository = join(import.meta.dirname, '..', '..', '..');

function sourceFiles(from: string, extensions = ['.ts', '.tsx']): string[] {
  const found: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(path);
      } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
        found.push(path);
      }
    }
  };

  walk(from);

  return found.sort();
}

/**
 * Every `from '…'`, `import '…'` and `import('…')` specifier in the file. The whitespace after a
 * bare `from` is required: without it the pattern also matches prose that happens to end in the
 * word, as in `'…comes from'`.
 */
function importsOf(source: string): string[] {
  const pattern = /\bfrom\s+'([^']+)'|\bimport\s*\(\s*'([^']+)'|\bimport\s+'([^']+)'/g;

  return [...source.matchAll(pattern)].map((match) => match[1] ?? match[2] ?? match[3] ?? '');
}

const files = sourceFiles(root);

describe('extraction seam', () => {
  it('finds the core sources', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => relative(root, file)))(
    '%s imports nothing outside the core',
    (file) => {
      const source = readFileSync(join(root, file), 'utf8');
      const specifiers = importsOf(source);
      const isTest = file.includes('.test.');

      for (const specifier of specifiers) {
        expect(specifier.startsWith('@/'), `${file} imports app code: ${specifier}`).toBe(false);
        expect(specifier === 'react' || specifier.startsWith('react/')).toBe(false);

        if (!isTest) {
          expect(specifier.startsWith('.'), `${file} imports a package: ${specifier}`).toBe(true);
        }
      }
    },
  );
});

/*
 * One raw NUL byte turns a text file binary for every text tool at once: `grep` and `rg` print
 * "binary file matches" instead of the matching lines, and GitHub's diff and code search do the
 * same. Collision-proof key separators are still the right call — write them as `\u001F` escapes,
 * which no mermaid identifier can contain either. The byte is constructed rather than typed so this
 * file does not trip its own rule.
 */
describe('no NUL bytes in the sources', () => {
  const scanned = ['src', 'testing', 'scripts'].flatMap((directory) =>
    sourceFiles(join(repository, directory), ['.ts', '.tsx', '.css']),
  );

  it('scans past the diagram core', () => {
    expect(scanned.length).toBeGreaterThan(files.length);
  });

  it('finds none', () => {
    const nul = String.fromCodePoint(0);
    const offenders = scanned
      .filter((file) => readFileSync(file, 'utf8').includes(nul))
      .map((file) => relative(repository, file));

    expect(offenders, 'write the separator as a \\u001F escape instead').toEqual([]);
  });
});
