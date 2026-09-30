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
 * cannot resolve), is skipped with its subtree. `visit` returns whether to descend. Each key in
 * `visited` is skipped, and each key visited joins it, so a cyclic `children` reference terminates
 * and a subtree shared by several parents is expanded once. The walk is iterative because a hostile
 * spec can nest deeper than the call stack.
 */
function walk(
  elements: Record<string, unknown>,
  childKeys: readonly unknown[],
  isVisible: IsVisible,
  visited: Set<string>,
  visit: (key: string, element: Record<string, unknown>) => boolean,
): void {
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

function stopMarkers(
  elements: Record<string, unknown>,
  childKeys: readonly unknown[],
  isVisible: IsVisible,
  visited: Set<string>,
): StopMarker[] {
  const markers: StopMarker[] = [];

  walk(elements, childKeys, isVisible, visited, (key, element) => {
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

/**
 * The pins of every Stop with coordinates under `childKeys`, in document order. A nested Day keeps
 * its Stops for its own map.
 */
export function collectStopMarkers(
  elements: Record<string, unknown>,
  childKeys: readonly unknown[],
  isVisible: IsVisible = alwaysVisible,
): StopMarker[] {
  return stopMarkers(elements, childKeys, isVisible, new Set());
}

/**
 * Each Day under `childKeys` in document order, with its pins. Days nested in a Day, or in a nested
 * Itinerary, are their own. One walk covers the Days and their pins, so an element shared by
 * several Days is expanded once, for the first Day.
 */
export function collectItineraryDays(
  elements: Record<string, unknown>,
  childKeys: readonly unknown[],
  isVisible: IsVisible = alwaysVisible,
): ItineraryDay[] {
  const days: ItineraryDay[] = [];
  const visited = new Set<string>();

  walk(elements, childKeys, isVisible, visited, (key, element) => {
    if (element.type === 'Itinerary') {
      return false;
    }

    if (element.type !== 'Day') {
      return true;
    }

    const props = isRecord(element.props) ? element.props : {};

    days.push({
      key,
      label: typeof props.label === 'string' ? props.label : '',
      markers: Array.isArray(element.children)
        ? stopMarkers(elements, element.children, isVisible, visited)
        : [],
    });

    return false;
  });

  return days;
}
