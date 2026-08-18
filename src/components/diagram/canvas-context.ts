/*
 * The canvas view, published to whatever draws controls. Uncontrolled by design: the transform is
 * `Diagram.Canvas`'s own state, and a replacement control cluster gets these four actions rather
 * than a setter, so no consumer can put the view in an impossible place.
 *
 * `useOptionalDiagramCanvas` exists for one caller: `Diagram.Svg`, which must draw at natural size
 * inside a canvas and keep its fitted behaviour everywhere else.
 */

import { createContext, useContext } from 'react';

import type { CanvasTransform } from './canvas-transform';

export interface DiagramCanvasContextValue {
  transform: CanvasTransform;
  /** `Math.round(k * 100)` — the readout, and the number in the reset button's name. */
  zoomPercent: number;
  /** Multiplies the zoom about the viewport centre, clamped. */
  zoomBy: (factor: number) => void;
  /** Moves the camera by screen pixels. */
  panBy: (dx: number, dy: number) => void;
  fit: () => void;
  reset: () => void;
}

const DiagramCanvasContext = createContext<DiagramCanvasContextValue | null>(null);

export const DiagramCanvasProvider = DiagramCanvasContext.Provider;

export function useDiagramCanvas(): DiagramCanvasContextValue {
  const value = useContext(DiagramCanvasContext);

  if (!value) {
    throw new Error('Canvas parts must be rendered inside <Diagram.Canvas>.');
  }

  return value;
}

export function useOptionalDiagramCanvas(): DiagramCanvasContextValue | null {
  return useContext(DiagramCanvasContext);
}
