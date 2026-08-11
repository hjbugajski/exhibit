/*
 * Fixture-corpus loader. Sources live as `.mmd` files under `fixtures/`, named `<family>-<case>`,
 * so a family stage adds coverage by dropping in a file rather than editing a table.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Fixture {
  /** File stem, e.g. `flowchart-subgraph`. */
  name: string;
  /** Leading segment of the stem — the family the fixture targets. */
  family: string;
  source: string;
}

const directory = join(import.meta.dirname, 'fixtures');

export function loadCorpus(family?: string): Fixture[] {
  return readdirSync(directory)
    .filter((entry) => entry.endsWith('.mmd'))
    .sort()
    .map((entry) => {
      const name = entry.slice(0, -'.mmd'.length);

      return {
        name,
        family: name.split('-')[0] ?? name,
        source: readFileSync(join(directory, entry), 'utf8'),
      };
    })
    .filter((fixture) => family === undefined || fixture.family === family);
}
