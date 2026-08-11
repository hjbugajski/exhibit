/*
 * Canvas interaction: one piece of state (`{x, y, k, animate}`), a handful of refs for things a
 * re-render must not depend on, and event handlers that only ever call into `canvas-transform`.
 *
 * Why React state and not imperative rAF writes: `children` arrive from the parent as a stable
 * element, so a canvas re-render reconciles the same element object and React skips the drawing
 * entirely. One style attribute write per event is exactly what an imperative version would do,
 * minus the machinery. Do not "optimise" this into refs plus `setProperty`.
 *
 * Two attachments are deliberately not React props. `wheel` is a native listener with
 * `{ passive: false }`, because React registers `wheel` passively at the root container and
 * `preventDefault()` from `onWheel` is a no-op plus a console warning — and the embed rule (plain
 * wheel scrolls the page, ctrl/cmd + wheel zooms) depends on preventing the default. `ResizeObserver`
 * is the only way a canvas that first laid out at zero height ever gets fitted.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, RefObject } from 'react';

import { round2 } from '@/lib/diagram/core/geometry/path';
import type { Point, Scene, Size } from '@/lib/diagram/types';

import type { DiagramCanvasContextValue } from './canvas-context';
import type { CanvasTransform } from './canvas-transform';
import {
  FIT_MAX_ZOOM,
  IDENTITY,
  PAN_STEP,
  PAN_STEP_FAST,
  ZOOM_STEP,
  centerTransform,
  distance,
  fitTransform,
  gridScale,
  isFiniteTransform,
  midpoint,
  panBy as panTransform,
  wheelFactor,
  zoomAt,
} from './canvas-transform';

interface CanvasView extends CanvasTransform {
  /** Rides in the same state object so the attribute can never be stale against the values. */
  animate: boolean;
}

export interface CanvasController {
  ref: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
  panning: boolean;
  animate: boolean;
  context: DiagramCanvasContextValue;
  handlers: {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  };
}

const INITIAL: CanvasView = { ...IDENTITY, animate: false };

/** `useLayoutEffect` warns during SSR, and the mount fit must paint in the diagram's first frame. */
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/** The padding box is the transform's coordinate space, so the border has to come off. */
function localPoint(element: HTMLElement, clientX: number, clientY: number): Point {
  const rect = element.getBoundingClientRect();

  return {
    x: clientX - rect.left - element.clientLeft,
    y: clientY - rect.top - element.clientTop,
  };
}

function viewportSize(element: HTMLElement | null): Size | null {
  return element ? { width: element.clientWidth, height: element.clientHeight } : null;
}

function centerPoint(element: HTMLElement | null): Point {
  const size = viewportSize(element);

  return size ? { x: size.width / 2, y: size.height / 2 } : { x: 0, y: 0 };
}

export function useCanvas(scene: Scene | null): CanvasController {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<CanvasView>(INITIAL);
  const [panning, setPanning] = useState(false);

  const sceneRef = useRef<Scene | null>(scene);
  /** Every live pointer, in insertion order: one entry drags, two pinch. */
  const pointsRef = useRef(new Map<number, Point>());
  const dragRef = useRef<number | null>(null);
  /** Set by any user-initiated transform; gates every automatic re-fit. */
  const interactedRef = useRef(false);
  /** A fit was asked for while the canvas or the scene measured zero. */
  const pendingFitRef = useRef(false);

  const update = useCallback(
    (next: (transform: CanvasTransform) => CanvasTransform, animate: boolean) => {
      setView((current) => {
        const transform = next(current);

        return isFiniteTransform(transform) ? { ...transform, animate } : current;
      });
    },
    [],
  );

  const applyFit = useCallback((animate: boolean) => {
    const size = sceneRef.current?.size;
    const viewport = viewportSize(ref.current);
    const next = size && viewport ? fitTransform(size, viewport) : null;

    if (!next) {
      pendingFitRef.current = true;

      return;
    }

    pendingFitRef.current = false;
    setView({ ...next, animate });
  }, []);

  // Mount and every scene change. Once the user has moved the view it is theirs — a source edit or
  // the post-`fonts.ready` re-layout must not yank it back.
  useIsomorphicLayoutEffect(() => {
    sceneRef.current = scene;

    if (!interactedRef.current) {
      applyFit(false);
    }
  }, [scene, applyFit]);

  useEffect(() => {
    const element = ref.current;

    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (pendingFitRef.current || !interactedRef.current) {
        applyFit(false);
      }
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [applyFit]);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      // Plain wheel is the page's, not ours: a diagram embedded mid-article must stay scrollable.
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      interactedRef.current = true;

      const origin = localPoint(element, event.clientX, event.clientY);
      const factor = wheelFactor(event.deltaY, event.deltaMode, element.clientHeight);

      update((transform) => zoomAt(transform, factor, origin), false);
    };

    element.addEventListener('wheel', onWheel, { passive: false });

    return () => element.removeEventListener('wheel', onWheel);
  }, [update]);

  const zoomBy = useCallback(
    (factor: number) => {
      interactedRef.current = true;
      update((transform) => zoomAt(transform, factor, centerPoint(ref.current)), true);
    },
    [update],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      interactedRef.current = true;
      update((transform) => panTransform(transform, dx, dy), true);
    },
    [update],
  );

  const fit = useCallback(() => {
    // Deliberately does not clear `interactedRef`: pressing fit is not a request to re-enable
    // automatic following.
    interactedRef.current = true;
    applyFit(true);
  }, [applyFit]);

  const reset = useCallback(() => {
    interactedRef.current = true;

    const size = sceneRef.current?.size;
    const viewport = viewportSize(ref.current);

    setView(
      size && viewport
        ? { ...centerTransform(size, viewport, FIT_MAX_ZOOM), animate: true }
        : { ...IDENTITY, animate: true },
    );
  }, []);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const element = ref.current;
    const target = event.target as Element | null;

    // Pointer capture on the surface would retarget the control's own click, so a press that
    // started on the cluster never becomes a drag. `closest` also covers the icon inside a button.
    if (!element || target?.closest('[data-part="canvas-controls"]')) {
      return;
    }

    if ((event.button !== 0 && event.button !== 1) || pointsRef.current.has(event.pointerId)) {
      return;
    }

    pointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // No pointer capture in this engine; dragging still works while the pointer stays inside.
    }

    // Focus, so the keyboard shortcuts work after a click. Not `preventDefault` — that would stop it.
    element.focus({ preventScroll: true });

    dragRef.current = pointsRef.current.size === 1 ? event.pointerId : null;
    setPanning(true);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const element = ref.current;
      const points = pointsRef.current;
      const previous = points.get(event.pointerId);

      if (!element || !previous) {
        return;
      }

      const before = [...points.values()];

      points.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (points.size === 2) {
        const after = [...points.values()];
        const from = distance(before[0] as Point, before[1] as Point);
        const to = distance(after[0] as Point, after[1] as Point);

        if (!(from > 0 && to > 0)) {
          return;
        }

        const fromMid = midpoint(before[0] as Point, before[1] as Point);
        const toMid = midpoint(after[0] as Point, after[1] as Point);
        const origin = localPoint(element, toMid.x, toMid.y);

        interactedRef.current = true;
        update(
          (transform) =>
            panTransform(
              zoomAt(transform, to / from, origin),
              toMid.x - fromMid.x,
              toMid.y - fromMid.y,
            ),
          false,
        );

        return;
      }

      if (dragRef.current !== event.pointerId) {
        return;
      }

      interactedRef.current = true;
      update(
        (transform) =>
          panTransform(transform, event.clientX - previous.x, event.clientY - previous.y),
        false,
      );
    },
    [update],
  );

  const endPointer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const element = ref.current;
    const points = pointsRef.current;

    if (!points.delete(event.pointerId)) {
      return;
    }

    try {
      if (element?.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Same story as capture: nothing to release.
    }

    // A pinch that loses one finger continues as a drag with the other.
    dragRef.current = points.size === 1 ? ([...points.keys()][0] ?? null) : null;
    setPanning(points.size > 0);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const target = event.target as Element | null;

      if (target?.closest('input, textarea, select, [contenteditable]')) {
        return;
      }

      const step = event.shiftKey ? PAN_STEP_FAST : PAN_STEP;
      const { code, key } = event;

      // `+` lives on `=` in most layouts, hence the `code` fallbacks.
      if (key === '+' || key === '=' || code === 'Equal' || code === 'NumpadAdd') {
        zoomBy(ZOOM_STEP);
      } else if (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract') {
        zoomBy(1 / ZOOM_STEP);
      } else if (key === '0' || code === 'Digit0' || code === 'Numpad0') {
        fit();
      } else if (key === 'ArrowLeft') {
        // The camera moves the way the key points, so ArrowLeft reveals what is to the left.
        panBy(step, 0);
      } else if (key === 'ArrowRight') {
        panBy(-step, 0);
      } else if (key === 'ArrowUp') {
        panBy(0, step);
      } else if (key === 'ArrowDown') {
        panBy(0, -step);
      } else {
        return;
      }

      event.preventDefault();
    },
    [zoomBy, panBy, fit],
  );

  const style = useMemo(
    () =>
      ({
        '--diagram-canvas-pan-x': `${round2(view.x)}px`,
        '--diagram-canvas-pan-y': `${round2(view.y)}px`,
        '--diagram-canvas-zoom': String(round2(view.k)),
        '--diagram-canvas-grid-scale': String(round2(gridScale(view.k))),
      }) as CSSProperties,
    [view],
  );

  const context = useMemo<DiagramCanvasContextValue>(
    () => ({
      transform: { x: view.x, y: view.y, k: view.k },
      zoomPercent: Math.round(view.k * 100),
      zoomBy,
      panBy,
      fit,
      reset,
    }),
    [view.x, view.y, view.k, zoomBy, panBy, fit, reset],
  );

  return {
    ref,
    style,
    panning,
    animate: view.animate,
    context,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onLostPointerCapture: endPointer,
      onKeyDown,
    },
  };
}
