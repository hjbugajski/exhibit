import { describe, expect, it } from 'vitest';

import { defaultMetrics } from '../../metrics.ts';
import type { Size } from '../../types.ts';
import { flowShapes } from './flow-shapes.ts';
import { defaultShapes, FALLBACK_SHAPE, resolveShape } from './registry.ts';
import { stateShapes } from './state-shapes.ts';

const label: Size = { width: 80, height: 18 };
const names = Object.keys(defaultShapes);

describe('defaultShapes', () => {
  it('registers every flow and state shape', () => {
    expect(names).toEqual([...Object.keys(flowShapes), ...Object.keys(stateShapes)]);
  });

  it.each(names)('%s sizes to a finite, non-empty box', (name) => {
    const box = resolveShape(defaultShapes, name).size(label, defaultMetrics);

    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(Number.isFinite(box.width * box.height)).toBe(true);
  });

  it.each(Object.keys(flowShapes))('%s respects the minimum node box', (name) => {
    const box = resolveShape(defaultShapes, name).size({ width: 0, height: 0 }, defaultMetrics);

    expect(box.width).toBeGreaterThanOrEqual(defaultMetrics.minNodeWidth);
    expect(box.height).toBeGreaterThanOrEqual(defaultMetrics.minNodeHeight);
  });

  it.each(names)('%s emits a closed outline centred on the origin', (name) => {
    const shape = resolveShape(defaultShapes, name);
    const box = shape.size(label, defaultMetrics);
    const d = shape.outline(box, defaultMetrics);
    const coordinates = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)];

    expect(d.startsWith('M')).toBe(true);
    expect(coordinates.length).toBeGreaterThan(1);

    for (const [, x, y] of coordinates) {
      expect(Math.abs(Number(x))).toBeLessThanOrEqual(box.width / 2 + 0.01);
      expect(Math.abs(Number(y))).toBeLessThanOrEqual(box.height / 2 + 0.01);
    }
  });

  it.each(names)('%s anchors on its own boundary, never outside the box', (name) => {
    const shape = resolveShape(defaultShapes, name);
    const box = shape.size(label, defaultMetrics);

    for (const toward of [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: -3, y: 2 },
    ]) {
      const point = shape.anchor?.(box, toward, defaultMetrics) ?? { x: 0, y: 0 };

      expect(Math.abs(point.x)).toBeLessThanOrEqual(box.width / 2 + 0.01);
      expect(Math.abs(point.y)).toBeLessThanOrEqual(box.height / 2 + 0.01);
    }
  });

  it('keeps a wrapped label inside the rectangular shapes', () => {
    for (const name of ['rect', 'round', 'stadium', 'subroutine', 'cylinder']) {
      const box = resolveShape(defaultShapes, name).size(label, defaultMetrics);

      expect(box.width).toBeGreaterThanOrEqual(label.width + defaultMetrics.nodePaddingX * 2);
      expect(box.height).toBeGreaterThanOrEqual(label.height + defaultMetrics.nodePaddingY * 2);
    }
  });

  it('sizes a diamond so the label fits inside the rhombus', () => {
    const box = resolveShape(defaultShapes, 'diamond').size(label, defaultMetrics);
    const fit = label.width / box.width + label.height / box.height;

    expect(fit).toBeLessThanOrEqual(1);
  });

  it('anchors the diamond on its slanted edge rather than its bounding box', () => {
    const shape = resolveShape(defaultShapes, 'diamond');
    const box = shape.size(label, defaultMetrics);
    const point = shape.anchor?.(box, { x: 1, y: 1 }, defaultMetrics);

    expect(point?.x).toBeLessThan(box.width / 2);
    expect(point?.y).toBeLessThan(box.height / 2);
  });

  it('ignores the label for the fixed state markers', () => {
    for (const name of ['state-start', 'state-end', 'state-choice', 'state-bar']) {
      const shape = resolveShape(defaultShapes, name);

      expect(shape.size(label, defaultMetrics)).toEqual(
        shape.size({ width: 0, height: 0 }, defaultMetrics),
      );
    }
  });
});

describe('resolveShape', () => {
  it('falls back to a rectangle for an unknown name', () => {
    expect(resolveShape(defaultShapes, 'no-such-shape')).toBe(defaultShapes[FALLBACK_SHAPE]);
  });

  it('prefers a caller registry entry over the builtin', () => {
    const stadium = resolveShape(defaultShapes, 'stadium');

    expect(resolveShape({ ...defaultShapes, rect: stadium }, 'rect')).toBe(stadium);
  });
});
