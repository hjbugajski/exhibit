/**
 * Reads the map pins of a Day or an Itinerary straight from the spec, so the render path
 * (registry.tsx) has them in the first render and the publish lint (validate.ts) counts them the
 * same way. Specs reach both as hostile input, so every read tolerates garbage.
 *
 * React-free on purpose: validate.ts runs on the server for the publish tools.
 */

import type { VisibilityCondition } from '@json-render/core';

/** One Stop's map pin, keyed by the Stop's element key. */
export interface StopMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  description?: string;
}

/** A Day under an Itinerary, with its own pins. */
export interface ItineraryDay {
  key: string;
  label: string;
  markers: StopMarker[];
}

type IsVisible = (condition: VisibilityCondition) => boolean;

const alwaysVisible: IsVisible = () => true;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Visits the elements under `childKeys` in document order (pre-order). An element hidden by
 * `isVisible`, or one with `repeat` (its children render once per state item, from props this walk
 * cannot resolve), is skipped with its subtree. `visit` returns whether to descend. Each key is
 * visited once, so a cyclic `children` reference terminates. The walk is iterative because a
 * hostile spec can nest deeper than the call stack.
 */
function walk(
  elements: Record<string, unknown>,
  childKeys: readonly unknown[],
  isVisible: IsVisible,
  visit: (key: string, element: Record<string, unknown>) => boolean,
): void {
  const visited = new Set<string>();
  const stack = [...childKeys].reverse();

  while (stack.length > 0) {
    const key = stack.pop();

    if (typeof key !== 'string' || visited.has(key)) {
      continue;
    }

    visited.add(key);
    const element = elements[key];

    if (!isRecord(element) || element.repeat !== undefined) {
      continue;
    }

    // Unvalidated, as it is where the renderer evaluates the same value to hide the element.
    if (element.visible !== undefined && !isVisible(element.visible as VisibilityCondition)) {
      continue;
    }

    if (visit(key, element) && Array.isArray(element.children)) {
      for (let index = element.children.length - 1; index >= 0; index -= 1) {
        stack.push(element.children[index]);
      }
    }
  }
}

function stopMarker(key: string, props: unknown): StopMarker | null {
  if (!isRecord(props) || !isRecord(props.coordinates)) {
    return null;
  }

  const { lat, lng } = props.coordinates;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  return {
    id: key,
    lat,
    lng,
    label: typeof props.title === 'string' ? props.title : '',
    description: typeof props.location === 'string' ? props.location : undefined,
  };
}

/**
 * The pins of every Stop with coordinates under `childKeys`, in document order. A nested Day keeps
 * its Stops for its own map.
 */
export function collectStopMarkers(
  elements: Record<string, unknown>,
  childKeys: readonly unknown[],
  isVisible: IsVisible = alwaysVisible,
): StopMarker[] {
  const markers: StopMarker[] = [];

  walk(elements, childKeys, isVisible, (key, element) => {
    if (element.type === 'Day') {
      return false;
    }

    const marker = element.type === 'Stop' ? stopMarker(key, element.props) : null;

    if (marker) {
      markers.push(marker);
    }

    return true;
  });

  return markers;
}

/** Each Day under `childKeys` in document order, with its pins. Days nested in a Day are its own. */
export function collectItineraryDays(
  elements: Record<string, unknown>,
  childKeys: readonly unknown[],
  isVisible: IsVisible = alwaysVisible,
): ItineraryDay[] {
  const days: ItineraryDay[] = [];

  walk(elements, childKeys, isVisible, (key, element) => {
    if (element.type !== 'Day') {
      return true;
    }

    const props = isRecord(element.props) ? element.props : {};

    days.push({
      key,
      label: typeof props.label === 'string' ? props.label : '',
      markers: Array.isArray(element.children)
        ? collectStopMarkers(elements, element.children, isVisible)
        : [],
    });

    return false;
  });

  return days;
}
