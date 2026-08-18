/*
 * The canvas view math. Every claim the interaction makes — a zoom pins the point under the
 * pointer, a fit centres and never enlarges, a wheel notch is a bounded factor, a grid level never
 * shifts the lattice — is checkable here without a DOM.
 */

import { describe, expect, it } from 'vitest';

import type { Point } from '@/lib/diagram/types';

import {
  FIT_CONTROLS_CLEARANCE,
  FIT_MAX_ZOOM,
  FIT_PADDING,
  IDENTITY,
  MAX_WHEEL_DELTA,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  centerTransform,
  clampZoom,
  distance,
  fitTransform,
  gridScale,
  isFiniteTransform,
  midpoint,
  panBy,
  pinchTransform,
  wheelFactor,
  zoomAt,
} from './canvas-transform';
import type { CanvasTransform } from './canvas-transform';

/** The canvas point currently under a screen point — the inverse of the documented convention. */
function toCanvas(transform: CanvasTransform, screen: Point): Point {
  return { x: (screen.x - transform.x) / transform.k, y: (screen.y - transform.y) / transform.k };
}

describe('clampZoom', () => {
  it('holds the limits', () => {
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
    expect(clampZoom(1000)).toBe(MAX_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
  });
});

describe('zoomAt', () => {
  const cases: [CanvasTransform, number, Point][] = [
    [IDENTITY, 1.25, { x: 0, y: 0 }],
    [IDENTITY, 1.25, { x: 400, y: 250 }],
    [{ x: -120, y: 60, k: 0.8 }, 2, { x: 33, y: 190 }],
    [{ x: 15, y: -40, k: 2 }, 1 / 1.25, { x: 500, y: 500 }],
    // Clamped at both ends: the anchor must still be pinned exactly.
    [{ x: 10, y: 10, k: 3.9 }, 4, { x: 200, y: 120 }],
    [{ x: 10, y: 10, k: 0.3 }, 0.1, { x: 200, y: 120 }],
  ];

  it.each(cases)('pins the point under the origin (%o × %f at %o)', (transform, factor, origin) => {
    const next = zoomAt(transform, factor, origin);
    const before = toCanvas(transform, origin);
    const after = toCanvas(next, origin);

    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('clamps the zoom, never the anchor', () => {
    expect(zoomAt({ x: 10, y: 10, k: 3.9 }, 4, { x: 200, y: 120 }).k).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 10, y: 10, k: 0.3 }, 0.1, { x: 200, y: 120 }).k).toBe(MIN_ZOOM);
  });

  it('converges on the limits under repeated steps and never overshoots', () => {
    let zoomedIn = IDENTITY;
    let zoomedOut = IDENTITY;

    for (let step = 0; step < 40; step += 1) {
      zoomedIn = zoomAt(zoomedIn, ZOOM_STEP, { x: 300, y: 200 });
      zoomedOut = zoomAt(zoomedOut, 1 / ZOOM_STEP, { x: 300, y: 200 });

      expect(zoomedIn.k).toBeLessThanOrEqual(MAX_ZOOM);
      expect(zoomedOut.k).toBeGreaterThanOrEqual(MIN_ZOOM);
    }

    expect(zoomedIn.k).toBe(MAX_ZOOM);
    expect(zoomedOut.k).toBe(MIN_ZOOM);
  });
});

describe('panBy', () => {
  it('translates in screen pixels and leaves the zoom alone', () => {
    expect(panBy({ x: 4, y: 8, k: 2 }, 10, -3)).toEqual({ x: 14, y: 5, k: 2 });
  });
});

describe('pinchTransform', () => {
  const cases: [CanvasTransform, number, Point, Point][] = [
    // Pure zoom: the midpoint never moves.
    [IDENTITY, 1.2, { x: 300, y: 200 }, { x: 300, y: 200 }],
    // Pure pan: two fingers translating without spreading.
    [{ x: -40, y: 25, k: 1.5 }, 1, { x: 120, y: 90 }, { x: 190, y: 40 }],
    // The normal gesture: spread and drag at once, which is where double-counting shows up.
    [{ x: -40, y: 25, k: 1.5 }, 1.1, { x: 120, y: 90 }, { x: 140, y: 105 }],
    [{ x: 12, y: -8, k: 0.6 }, 0.85, { x: 400, y: 300 }, { x: 330, y: 360 }],
  ];

  it.each(cases)(
    'keeps the pinched canvas point under the moving midpoint (%o × %f, %o -> %o)',
    (transform, factor, from, to) => {
      const next = pinchTransform(transform, factor, from, to);
      const before = toCanvas(transform, from);
      const after = toCanvas(next, to);

      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    },
  );

  it('does not drift when a stationary gesture is repeated', () => {
    let view: CanvasTransform = { x: -40, y: 25, k: 1.5 };

    for (let step = 0; step < 20; step += 1) {
      view = pinchTransform(view, 1, { x: 200, y: 150 }, { x: 200, y: 150 });
    }

    expect(view).toEqual({ x: -40, y: 25, k: 1.5 });
  });
});

describe('fitTransform', () => {
  const viewport = { width: 800, height: 600 };

  it('centres the scene exactly, above the control strip', () => {
    const scene = { width: 400, height: 200 };
    const fitted = fitTransform(scene, viewport);
    const clear = viewport.height - FIT_CONTROLS_CLEARANCE;

    expect(fitted).not.toBeNull();
    expect(fitted?.x).toBeCloseTo((viewport.width - scene.width * (fitted?.k ?? 0)) / 2, 9);
    expect(fitted?.y).toBeCloseTo((clear - scene.height * (fitted?.k ?? 0)) / 2, 9);
  });

  it('leaves the controls room even when the block axis is the tighter one', () => {
    const scene = { width: 400, height: 1000 };
    const fitted = fitTransform(scene, viewport);
    const clear = viewport.height - FIT_CONTROLS_CLEARANCE - FIT_PADDING * 2;

    expect(fitted?.k).toBeCloseTo(clear / scene.height, 9);
  });

  it('never enlarges past natural size', () => {
    expect(fitTransform({ width: 40, height: 20 }, viewport)?.k).toBe(FIT_MAX_ZOOM);
  });

  it('shrinks a large scene to the padded box on its tighter axis', () => {
    const scene = { width: 2000, height: 400 };
    const fitted = fitTransform(scene, viewport);

    expect(fitted?.k).toBeCloseTo((viewport.width - FIT_PADDING * 2) / scene.width, 9);
  });

  it('clamps a vast scene at the minimum zoom', () => {
    expect(fitTransform({ width: 200_000, height: 200_000 }, viewport)?.k).toBe(MIN_ZOOM);
  });

  it.each([
    ['zero-width viewport', { width: 100, height: 100 }, { width: 0, height: 600 }],
    ['zero-height viewport', { width: 100, height: 100 }, { width: 800, height: 0 }],
    ['viewport smaller than its padding', { width: 100, height: 100 }, { width: 10, height: 10 }],
    ['zero scene', { width: 0, height: 0 }, { width: 800, height: 600 }],
  ])('returns null rather than a non-finite transform for a %s', (_name, scene, box) => {
    expect(fitTransform(scene, box)).toBeNull();
  });
});

describe('centerTransform', () => {
  it('places the scaled scene in the middle of the viewport', () => {
    expect(centerTransform({ width: 200, height: 100 }, { width: 800, height: 600 }, 2)).toEqual({
      x: 200,
      y: 200,
      k: 2,
    });
  });
});

describe('wheelFactor', () => {
  it('normalises every deltaMode to CSS pixels', () => {
    expect(wheelFactor(1, 1, 600)).toBeCloseTo(wheelFactor(16, 0, 600), 12);
    expect(wheelFactor(0.05, 2, 600)).toBeCloseTo(wheelFactor(30, 0, 600), 12);
  });

  it('is symmetric about zero', () => {
    expect(wheelFactor(0, 0, 600)).toBe(1);
    expect(wheelFactor(20, 0, 600) * wheelFactor(-20, 0, 600)).toBeCloseTo(1, 12);
  });

  it('clamps a huge delta and keeps one mouse notch modest', () => {
    expect(wheelFactor(10_000, 0, 600)).toBe(wheelFactor(MAX_WHEEL_DELTA, 0, 600));
    expect(wheelFactor(100, 0, 600)).toBeGreaterThan(0.7);
    expect(wheelFactor(-100, 0, 600)).toBeLessThan(1.29);
  });
});

describe('gridScale', () => {
  const zooms = [MIN_ZOOM, 0.26, 0.3, 0.49, 0.5, 0.51, 0.75, 0.99, 1, 1.5, 2.5, MAX_ZOOM];

  it.each(zooms)('keeps the on-screen spacing between one and two gaps at k=%f', (k) => {
    const scale = gridScale(k);

    if (k <= 1) {
      expect(scale).toBeGreaterThanOrEqual(1);
      expect(scale).toBeLessThan(2);
    } else {
      expect(scale).toBe(k);
    }
  });

  it.each(zooms)('draws a lattice of gap · 2ⁿ canvas units at k=%f', (k) => {
    const canvasStep = gridScale(k) / k;
    const exponent = Math.log2(canvasStep);

    expect(exponent).toBeCloseTo(Math.round(exponent), 9);
    expect(canvasStep).toBeGreaterThanOrEqual(1);
  });
});

describe('geometry helpers', () => {
  it('measures and bisects a pinch', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(midpoint({ x: 0, y: 0 }, { x: 3, y: 5 })).toEqual({ x: 1.5, y: 2.5 });
  });

  it('rejects a transform with a non-finite component', () => {
    expect(isFiniteTransform(IDENTITY)).toBe(true);
    expect(isFiniteTransform({ x: Number.NaN, y: 0, k: 1 })).toBe(false);
    expect(isFiniteTransform({ x: 0, y: 0, k: Number.POSITIVE_INFINITY })).toBe(false);
  });
});
