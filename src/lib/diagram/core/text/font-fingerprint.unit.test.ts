/*
 * The advance table in `font-metrics-inter.ts` is a recording of one specific font binary. Nothing
 * in the build notices when that binary is replaced, so the table quietly starts describing a face
 * that is no longer on the page — every box in every diagram comes out the wrong width, and the
 * only symptom is text that sits slightly off centre.
 *
 * This is the tripwire: the roman face is hashed and compared against the value recorded here at
 * the same time the table was generated. Only the roman face is hashed — it is the one the table
 * describes; the italic face is never measured, so bumping it alone must not send anyone through a
 * regeneration ritual that would change nothing.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { interMetrics } from './font-metrics-inter.ts';

/** `src/lib/diagram/core/text` → repository root. */
const font = join(import.meta.dirname, '..', '..', '..', '..', '..', 'public/fonts');

/** sha256 of `public/fonts/InterVariable.woff2`, recorded 2026-08-08 with the table beside it. */
const RECORDED = '693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3';

const REGENERATE =
  'The shipped InterVariable.woff2 is not the one the advance table was measured from. Run the ' +
  'dev-page generator (/dev/library/diagram → "Measure InterVariable") and commit both files: the ' +
  'regenerated font-metrics-inter.ts and the new hash in font-fingerprint.unit.test.ts.';

describe('font fingerprint', () => {
  it('matches the binary the advance table was measured from', () => {
    const bytes = readFileSync(join(font, 'InterVariable.woff2'));
    const hash = createHash('sha256').update(bytes).digest('hex');

    expect(hash, REGENERATE).toBe(RECORDED);
  });

  it('describes the face it fingerprints', () => {
    expect(interMetrics.family).toBe('InterVariable');
  });
});
