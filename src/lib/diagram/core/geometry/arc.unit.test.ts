import { describe, expect, it } from 'vitest';

import type { ArcSpec } from './arc.ts';
import { arcCentroid, arcD } from './arc.ts';

const quarter: ArcSpec = {
  center: { x: 100, y: 100 },
  outerRadius: 50,
  innerRadius: 0,
  startAngle: -Math.PI / 2,
  endAngle: 0,
};

describe('arcD', () => {
  it('draws a wedge from the center through both radii ends', () => {
    expect(arcD(quarter)).toBe('M100,100L100,50A50,50 0 0 1 150,100Z');
  });

  it('sets the large-arc flag past a half turn', () => {
    const threeQuarters = arcD({ ...quarter, endAngle: Math.PI });

    expect(threeQuarters).toContain('A50,50 0 1 1');
  });

  it('draws a full circle without a wedge seam', () => {
    const full = arcD({ ...quarter, endAngle: -Math.PI / 2 + Math.PI * 2 });

    expect(full.startsWith('M-50,100')).toBe(false);
    expect(full.split('A')).toHaveLength(3);
    expect(full).not.toContain('L');
  });

  it('adds the inner sweep for a donut', () => {
    const donut = arcD({ ...quarter, innerRadius: 20 });

    expect(donut).toContain('A20,20 0 0 0');
    expect(donut.startsWith('M100,50')).toBe(true);
  });

  it('is empty for a zero or negative sweep', () => {
    expect(arcD({ ...quarter, endAngle: quarter.startAngle })).toBe('');
  });
});

describe('arcCentroid', () => {
  it('sits on the bisector at the requested radius ratio', () => {
    const centroid = arcCentroid(quarter);
    const angle = -Math.PI / 4;

    expect(centroid.x).toBeCloseTo(100 + 50 * 0.68 * Math.cos(angle), 9);
    expect(centroid.y).toBeCloseTo(100 + 50 * 0.68 * Math.sin(angle), 9);
  });

  it('measures the ratio across the ring for a donut', () => {
    const centroid = arcCentroid({ ...quarter, innerRadius: 30 }, 0.5);

    expect(Math.hypot(centroid.x - 100, centroid.y - 100)).toBeCloseTo(40, 9);
  });
});
