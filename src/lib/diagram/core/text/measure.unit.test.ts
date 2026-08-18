import { describe, expect, it } from 'vitest';

import { defaultMetrics } from '../../metrics.ts';
import type { Size, TextMeasurer, TextStyle } from '../../types.ts';
import { textStyle, wrapLabel } from './measure.ts';

/** Ten pixels per character makes wrap points exactly predictable. */
const tenPerChar: TextMeasurer = {
  id: 'test:ten-per-char',
  measure: (text: string, style: TextStyle): Size => ({
    width: text.length * 10,
    height: style.fontSize * style.lineHeight,
  }),
};

const style: TextStyle = {
  fontSize: 10,
  fontFamily: 'test',
  fontWeight: 400,
  letterSpacing: 0,
  lineHeight: 1.5,
};

describe('wrapLabel', () => {
  it('wraps at word boundaries against the max width', () => {
    const box = wrapLabel(['aaa bbb ccc'], style, tenPerChar, 100);

    expect(box.lines).toEqual(['aaa bbb', 'ccc']);
    expect(box.width).toBe(70);
  });

  it('never breaks a single word that exceeds the max width', () => {
    const box = wrapLabel(['supercalifragilistic'], style, tenPerChar, 50);

    expect(box.lines).toEqual(['supercalifragilistic']);
    expect(box.width).toBe(200);
  });

  it('honours explicit breaks before wrapping', () => {
    const box = wrapLabel(['one', 'two three four'], style, tenPerChar, 90);

    expect(box.lines).toEqual(['one', 'two three', 'four']);
  });

  it('collapses internal whitespace and drops blank lines', () => {
    const box = wrapLabel(['  a   b  ', '   ', ''], style, tenPerChar, 1000);

    expect(box.lines).toEqual(['a b']);
  });

  it('returns an empty box for a whitespace-only label', () => {
    const box = wrapLabel(['   '], style, tenPerChar, 100);

    expect(box.lines).toEqual([]);
    expect(box).toMatchObject({ width: 0, height: 0 });
  });

  it('derives height and baseline from the style', () => {
    const box = wrapLabel(['a', 'b'], style, tenPerChar, 100);

    expect(box.lineHeight).toBe(15);
    expect(box.height).toBe(30);
    expect(box.baseline).toBeCloseTo(15 / 2 + 10 * 0.36, 6);
  });

  it('treats a non-positive max width as unbounded', () => {
    const box = wrapLabel(['aaa bbb ccc'], style, tenPerChar, 0);

    expect(box.lines).toEqual(['aaa bbb ccc']);
  });
});

describe('textStyle', () => {
  it('projects the typography metrics onto a text style', () => {
    expect(textStyle(defaultMetrics)).toEqual({
      fontSize: defaultMetrics.fontSize,
      fontFamily: defaultMetrics.fontFamily,
      fontWeight: defaultMetrics.fontWeight,
      letterSpacing: defaultMetrics.letterSpacing,
      lineHeight: defaultMetrics.lineHeight,
    });
  });

  it('gives each role its own size and tracking, and one shared weight', () => {
    const node = textStyle(defaultMetrics);
    const edge = textStyle(defaultMetrics, 'edgeLabel');
    const cluster = textStyle(defaultMetrics, 'clusterTitle');

    expect([node.fontSize, edge.fontSize, cluster.fontSize]).toEqual([
      defaultMetrics.fontSize,
      defaultMetrics.edgeLabelFontSize,
      defaultMetrics.clusterTitleFontSize,
    ]);
    expect(cluster.letterSpacing).toBe(defaultMetrics.clusterTitleLetterSpacing);
    expect(edge.letterSpacing).toBe(defaultMetrics.letterSpacing);
    expect(new Set([node.fontWeight, edge.fontWeight, cluster.fontWeight]).size).toBe(1);
  });
});
