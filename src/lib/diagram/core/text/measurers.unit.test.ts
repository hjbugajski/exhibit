import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { TextMeasurer, TextStyle } from '../../types.ts';
import { interMetrics } from './font-metrics-inter.ts';
import {
  calibrateFont,
  createMetricsMeasurer,
  memoizeMeasurer,
  metricsMeasurer,
} from './measurers.ts';

const style: TextStyle = {
  fontSize: 100,
  fontFamily: 'InterVariable',
  fontWeight: 400,
  letterSpacing: 0,
  lineHeight: 1.4,
};

describe('metricsMeasurer', () => {
  it('sums the table advances at the requested size', () => {
    const expected = (interMetrics.advances.a as number) + (interMetrics.advances.b as number);

    expect(metricsMeasurer.measure('ab', style).width).toBeCloseTo(expected * 100, 6);
  });

  it('is deterministic and additive', () => {
    const once = metricsMeasurer.measure('deploy', style).width;

    expect(metricsMeasurer.measure('deploy', style).width).toBe(once);
    expect(metricsMeasurer.measure('deploydeploy', style).width).toBeCloseTo(once * 2, 6);
  });

  it('orders narrow glyphs below wide ones', () => {
    expect(metricsMeasurer.measure('iii', style).width).toBeLessThan(
      metricsMeasurer.measure('mmm', style).width,
    );
  });

  // The accented literal below is decomposed (U+0065 U+0301), so it exercises the combining bucket.
  it('buckets CJK as full width and combining marks as zero', () => {
    expect(metricsMeasurer.measure('日本語', style).width).toBeCloseTo(300, 6);
    expect(metricsMeasurer.measure('é', style).width).toBeCloseTo(
      metricsMeasurer.measure('e', style).width,
      6,
    );
  });

  it('falls back to the default advance for unlisted codepoints', () => {
    expect(metricsMeasurer.measure('Ж', style).width).toBeCloseTo(
      interMetrics.fallback.default * 100,
      6,
    );
  });

  it('adds letter spacing per character and takes height from the line height', () => {
    const spaced = metricsMeasurer.measure('ab', { ...style, letterSpacing: 2 });

    expect(spaced.width).toBeCloseTo(metricsMeasurer.measure('ab', style).width + 4, 6);
    expect(spaced.height).toBe(140);
  });

  it('counts an astral codepoint once', () => {
    expect(metricsMeasurer.measure('😀', style).width).toBeCloseTo(100, 6);
  });

  it('keys its id on the font family so a table swap invalidates layout memos', () => {
    const other = createMetricsMeasurer({ ...interMetrics, family: 'Other' });

    expect(metricsMeasurer.id).toBe('metrics:InterVariable');
    expect(other.id).toBe('metrics:Other');
  });
});

describe('memoizeMeasurer', () => {
  it('returns cached sizes and keeps the wrapped id', () => {
    let calls = 0;
    const counted: TextMeasurer = {
      id: 'counted',
      measure: (text) => {
        calls += 1;

        return { width: text.length, height: 1 };
      },
    };
    const memo = memoizeMeasurer(counted);

    expect(memo.id).toBe('counted');
    expect(memo.measure('abc', style)).toEqual({ width: 3, height: 1 });
    expect(memo.measure('abc', style)).toEqual({ width: 3, height: 1 });
    expect(calls).toBe(1);
  });

  it('keys on the style, not just the text', () => {
    let calls = 0;
    const counted: TextMeasurer = {
      id: 'counted',
      measure: (text, textStyle) => {
        calls += 1;

        return { width: text.length * textStyle.fontSize, height: 1 };
      },
    };
    const memo = memoizeMeasurer(counted);

    memo.measure('abc', style);
    memo.measure('abc', { ...style, fontSize: 12 });

    expect(calls).toBe(2);
  });

  it('evicts the oldest entry rather than clearing the whole cache at its limit', () => {
    let calls = 0;
    const counted: TextMeasurer = {
      id: 'counted',
      measure: (text) => {
        calls += 1;

        return { width: text.length, height: 1 };
      },
    };
    const memo = memoizeMeasurer(counted, 2);

    memo.measure('a', style);
    memo.measure('b', style);
    memo.measure('c', style);

    expect(calls).toBe(3);

    // 'a' was the oldest and is gone; 'b' and 'c' survived, which a wholesale clear would not do.
    memo.measure('b', style);
    memo.measure('c', style);

    expect(calls).toBe(3);

    memo.measure('a', style);

    expect(calls).toBe(4);
  });
});

describe('calibrateFont', () => {
  const doubled: TextMeasurer = {
    id: 'doubled',
    measure: (text, textStyle) => ({
      width: metricsMeasurer.measure(text, textStyle).width * 2,
      height: textStyle.fontSize,
    }),
  };

  it('reads every advance back off a live measurer, at the measurer\u2019s scale', () => {
    const font = calibrateFont(interMetrics, doubled, style);

    expect(font.advances.a).toBeCloseTo((interMetrics.advances.a as number) * 2, 6);
    expect(Object.keys(font.advances)).toEqual(Object.keys(interMetrics.advances));
    expect(createMetricsMeasurer(font).measure('ab', style).width).toBeCloseTo(
      metricsMeasurer.measure('ab', style).width * 2,
      6,
    );
  });

  it('names the table apart so the layout memo key changes with it', () => {
    expect(createMetricsMeasurer(calibrateFont(interMetrics, doubled, style)).id).not.toBe(
      metricsMeasurer.id,
    );
  });

  it('keeps the shipped advance for a glyph the measurer cannot see', () => {
    const blind: TextMeasurer = { id: 'blind', measure: () => ({ width: 0, height: 0 }) };
    const font = calibrateFont(interMetrics, blind, style);

    expect(font.advances).toEqual(interMetrics.advances);
    expect(font.fallback.cjk).toBe(interMetrics.fallback.cjk);
  });

  it('measures without letter spacing so the advance is the glyph alone', () => {
    const tracked = calibrateFont(interMetrics, doubled, { ...style, letterSpacing: 40 });

    expect(tracked.advances.a).toBeCloseTo((interMetrics.advances.a as number) * 2, 6);
  });
});

/*
 * Everything above checks the table against itself, so a bad regeneration of `font-metrics-inter.ts`
 * would pass all of it. `measurement-baseline.json` is the outside witness: whole-string widths as
 * Chrome measured them for the shipped webfont, recorded once, at the three sizes the type roles
 * draw at. The 4% band is the honest one — the table sums advances and the browser kerns, and the
 * measured residual on the corpus is around 2%.
 */
describe('recorded measurement baseline', () => {
  interface Baseline {
    font: string;
    fontWeight: number;
    letterSpacing: number;
    widths: Record<string, Record<string, number>>;
  }

  const baseline = JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        '..',
        '..',
        '..',
        '..',
        '..',
        'testing/diagram/measurement-baseline.json',
      ),
      'utf8',
    ),
  ) as Baseline;

  const cases = Object.entries(baseline.widths).flatMap(([fontSize, widths]) =>
    Object.entries(widths).map(([text, width]): [string, number, number] => [
      text,
      Number(fontSize),
      width,
    ]),
  );

  it('covers every type role at its own size', () => {
    expect(Object.keys(baseline.widths).sort()).toEqual(['11', '12', '13']);
    expect(cases.length).toBeGreaterThan(30);
  });

  it.each(cases)('"%s" at %ipx stays within 4% of the recording', (text, fontSize, expected) => {
    const measured = metricsMeasurer.measure(text, {
      ...style,
      fontSize,
      fontFamily: baseline.font,
      fontWeight: baseline.fontWeight,
      letterSpacing: baseline.letterSpacing,
    }).width;

    expect(Math.abs(measured - expected) / expected).toBeLessThan(0.04);
  });
});
