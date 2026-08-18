/*
 * Canvas view math. Framework-free and DOM-free on purpose: every interesting decision the canvas
 * makes — where a zoom anchors, what "fit" means, how a wheel notch becomes a factor, which grid
 * level is drawn — is a pure function here, and `use-canvas.ts` only wires events to it.
 *
 * Convention (d3-zoom): translate, then scale, origin at the top-left of the padding box.
 *
 *   screen = k · canvas + (x, y)          canvas = (screen − (x, y)) / k
 *
 * The CSS composes that exactly once (`transform: translate(…) scale(…)` with
 * `transform-origin: 0 0`), so no call site can get the order wrong.
 */

import type { Point, Size } from '@/lib/diagram/types';

export interface CanvasTransform {
  x: number;
  y: number;
  k: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
/** Fit never enlarges past natural size — a two-node graph should not fill a 900px canvas. */
export const FIT_MAX_ZOOM = 1;
/** Screen px kept clear on every side by `fitTransform`. */
export const FIT_PADDING = 16;
/**
 * Extra block-end clearance for `fitTransform`, on top of `FIT_PADDING`: the zoom controls float
 * over the bottom-right corner, so a scene fitted to the whole box has its last row under them.
 * Matches the control bar's 2rem height and 0.5rem inset.
 */
export const FIT_CONTROLS_CLEARANCE = 40;
/** One button press, one `+`/`-` key. */
export const ZOOM_STEP = 1.25;
export const WHEEL_SPEED = 0.01;
/** Per-event clamp before the exponential, so one mouse notch is not a 2.7x jump. */
export const MAX_WHEEL_DELTA = 25;
export const PAN_STEP = 32;
export const PAN_STEP_FAST = 128;

export const IDENTITY: CanvasTransform = { x: 0, y: 0, k: 1 };

export const clampZoom = (k: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/** Scales by `factor` about `origin` (screen px, padding-box relative), pinning that point. */
export function zoomAt(transform: CanvasTransform, factor: number, origin: Point): CanvasTransform {
  const k = clampZoom(transform.k * factor);
  // Recomputed *after* clamping, so a zoom that hits a limit still pins the anchor exactly.
  const ratio = k / transform.k;

  return {
    k,
    x: origin.x - ratio * (origin.x - transform.x),
    y: origin.y - ratio * (origin.y - transform.y),
  };
}

export function panBy(transform: CanvasTransform, dx: number, dy: number): CanvasTransform {
  return { ...transform, x: transform.x + dx, y: transform.y + dy };
}

/**
 * One pinch step: the canvas point under `from` (the midpoint before the move) ends up under `to`
 * (the midpoint after it), scaled by `factor`. Composition order is the whole point — anchoring the
 * zoom at the *new* midpoint and then panning by the delta counts that delta twice, by `(factor−1)`
 * of it per event, which is why a pinch that also drags slides out from under the fingers.
 */
export function pinchTransform(
  transform: CanvasTransform,
  factor: number,
  from: Point,
  to: Point,
): CanvasTransform {
  return panBy(zoomAt(transform, factor, from), to.x - from.x, to.y - from.y);
}

export function centerTransform(scene: Size, viewport: Size, k: number): CanvasTransform {
  return {
    k,
    x: (viewport.width - scene.width * k) / 2,
    y: (viewport.height - scene.height * k) / 2,
  };
}

/**
 * Centred, padded, never above `FIT_MAX_ZOOM`, never below `MIN_ZOOM`. Null — never a non-finite
 * transform — when either box is unmeasurable, which is the normal state of a canvas in a hidden
 * tab or before first layout.
 */
export function fitTransform(scene: Size, viewport: Size): CanvasTransform | null {
  // The controls are only ever at the block end, so the box the scene is fitted and centred in is
  // the viewport minus that strip — one box, used for both, or the scene would fit and then drift.
  const clear: Size = {
    width: viewport.width,
    height: viewport.height - FIT_CONTROLS_CLEARANCE,
  };
  const width = clear.width - FIT_PADDING * 2;
  const height = clear.height - FIT_PADDING * 2;

  if (!(width > 0 && height > 0 && scene.width > 0 && scene.height > 0)) {
    return null;
  }

  const k = Math.min(
    FIT_MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min(width / scene.width, height / scene.height)),
  );

  return centerTransform(scene, clear, k);
}

/** Wheel delta in CSS px whatever the `deltaMode`, clamped, as a multiplicative zoom factor. */
export function wheelFactor(deltaY: number, deltaMode: number, viewportHeight: number): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * viewportHeight : deltaY;
  const clamped = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, pixels));

  return Math.exp(-clamped * WHEEL_SPEED);
}

/**
 * Grid level of detail as a unitless multiplier, so JS never needs the dot gap in pixels: the
 * on-screen spacing is `gap * gridScale(k)`, which stays in `[gap, 2·gap)` while zoomed out and
 * grows with `k` while zoomed in. Every level's lattice is `gap · 2ⁿ` canvas units anchored at the
 * canvas origin, hence a subset of the finer one — a level change never shifts the dots.
 */
export function gridScale(k: number): number {
  return 2 ** Math.max(0, Math.ceil(-Math.log2(k))) * k;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function isFiniteTransform(transform: CanvasTransform): boolean {
  return (
    Number.isFinite(transform.x) && Number.isFinite(transform.y) && Number.isFinite(transform.k)
  );
}
