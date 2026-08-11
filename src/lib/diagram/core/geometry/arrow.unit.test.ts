import { describe, expect, it } from 'vitest';

import { defaultMetrics } from '../../metrics.ts';
import { arrowHead } from './arrow.ts';

const from = { x: 0, y: 0 };
const tip = { x: 0, y: 100 };

describe('arrowHead', () => {
  it('is absent for a headless edge', () => {
    expect(arrowHead('none', tip, from, defaultMetrics)).toBeNull();
  });

  it('trims the stroke back by the head length and points at the tip', () => {
    const head = arrowHead('arrow', tip, from, defaultMetrics);

    expect(head?.anchor.y).toBeCloseTo(100 - defaultMetrics.arrowLength, 9);
    expect(head?.anchor.x).toBeCloseTo(0, 9);
    expect(head?.d.startsWith('M0,100')).toBe(true);
    expect(head?.d.endsWith('Z')).toBe(true);
  });

  it('spans the arrow width across the direction of travel', () => {
    const head = arrowHead('arrow', tip, from, defaultMetrics);
    const xs = [...(head?.d.matchAll(/[ML](-?[\d.]+),/g) ?? [])].map((match) => Number(match[1]));

    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(defaultMetrics.arrowWidth, 6);
  });

  it('sits the circle cap fully behind the tip', () => {
    const head = arrowHead('circle', tip, from, defaultMetrics);

    expect(head?.anchor.y).toBeCloseTo(100 - defaultMetrics.arrowCapSize, 9);
  });

  it('draws the cross cap as two strokes', () => {
    const head = arrowHead('cross', tip, from, defaultMetrics);

    expect(head?.d.split('M')).toHaveLength(3);
    expect(head?.anchor.y).toBeCloseTo(100 - defaultMetrics.arrowCapSize, 9);
  });

  it('sizes the caps independently of the solid head', () => {
    const narrow = { ...defaultMetrics, arrowWidth: 2 };

    expect(arrowHead('circle', tip, from, narrow)?.d).toBe(
      arrowHead('circle', tip, from, defaultMetrics)?.d,
    );
    expect(arrowHead('cross', tip, from, narrow)?.d).toBe(
      arrowHead('cross', tip, from, defaultMetrics)?.d,
    );
  });

  it('follows the incoming direction', () => {
    const head = arrowHead('arrow', { x: 100, y: 0 }, from, defaultMetrics);

    expect(head?.anchor.x).toBeCloseTo(100 - defaultMetrics.arrowLength, 9);
    expect(head?.anchor.y).toBeCloseTo(0, 9);
  });

  it('falls back to a downward head when the endpoints coincide', () => {
    const head = arrowHead('arrow', from, from, defaultMetrics);

    expect(head?.anchor).toEqual({ x: 0, y: -defaultMetrics.arrowLength });
  });
});
