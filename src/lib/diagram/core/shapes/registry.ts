/*
 * Shape lookup. A registry is a plain record so a consumer merges or replaces entries with object
 * spread; anything that changes a node's size lives here, never in a component override.
 */

import type { ShapeDef, ShapeRegistry } from '../../types.ts';
import { flowShapes } from './flow-shapes.ts';
import { stateShapes } from './state-shapes.ts';

export const defaultShapes: ShapeRegistry = { ...flowShapes, ...stateShapes };

export const FALLBACK_SHAPE = 'rect';

/** Unknown shape names fall back to a rectangle rather than failing the whole layout. */
export function resolveShape(shapes: ShapeRegistry, name: string): ShapeDef {
  return shapes[name] ?? shapes[FALLBACK_SHAPE] ?? (flowShapes[FALLBACK_SHAPE] as ShapeDef);
}
