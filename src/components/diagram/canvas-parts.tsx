/*
 * `Diagram.Canvas` — the second view mode. A clipped viewport with a dotted grid, wheel/pinch zoom,
 * drag pan and a control cluster, wrapped around the same `<Diagram.Svg/>` the static mode draws.
 * View mode is orthogonal to diagram family: any source renders in either.
 *
 * The controls are library parts, not house components: every file here but `house-diagram.tsx`
 * imports nothing under `@/components`, which `extraction-seam.unit.test.ts` enforces. Their glyphs
 * are inline paths with no paint attribute; `diagram.css` strokes them.
 *
 * Nothing here writes a transform into an inline style: the canvas element carries
 * `--diagram-canvas-*` custom properties and the stylesheet composes the transform once, which is
 * both the theming contract (no paint, geometry only) and the guarantee that translate and scale
 * can never be applied in the wrong order.
 */

import type { ComponentProps, ReactNode } from 'react';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';

import { cn } from '@/lib/utils';

import { DiagramCanvasProvider, useDiagramCanvas } from './canvas-context';
import { ZOOM_STEP } from './canvas-transform';
import type { PartProps } from './diagram-context';
import { useDiagramConfig, useDiagramScene } from './diagram-context';
import { useCanvas } from './use-canvas';

const DEFAULT_LABEL =
  'Diagram canvas. Drag to pan. Hold Ctrl or Command and scroll to zoom. Arrow keys pan, plus and minus zoom, zero fits the diagram.';

// -------------------------------------------------------------------------------------- glyphs

/** 16-unit box, 1.5 stroke, all of it declared in CSS — an icon here owns geometry only. */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" data-part="canvas-icon" viewBox="0 0 16 16">
      {children}
    </svg>
  );
}

const ZoomOutIcon = () => (
  <Glyph>
    <path d="M3.5 8h9" />
  </Glyph>
);

const ZoomInIcon = () => (
  <Glyph>
    <path d="M8 3.5v9M3.5 8h9" />
  </Glyph>
);

const FitIcon = () => (
  <Glyph>
    <path d="M3 6.5V3h3.5M9.5 3H13v3.5M13 9.5V13H9.5M6.5 13H3V9.5" />
  </Glyph>
);

// ------------------------------------------------------------------------------------ controls

interface ControlProps extends ComponentProps<'button'> {
  action: string;
}

function Control({ action, className, ...props }: ControlProps) {
  const { classNames } = useDiagramConfig();

  return (
    <button
      data-action={action}
      data-part="canvas-control"
      type="button"
      className={cn(classNames.canvasControl, className)}
      {...props}
    />
  );
}

export type DiagramCanvasControlsProps = ComponentProps<'div'>;

/**
 * Never disabled at the zoom limits: clamping already makes the press a no-op, and disabling the
 * button under the pointer would drop focus to the body mid-interaction.
 */
export function CanvasControls({ className, children, ...props }: DiagramCanvasControlsProps) {
  const { classNames } = useDiagramConfig();
  const { fit, reset, zoomBy, zoomPercent } = useDiagramCanvas();

  return (
    <div
      aria-label="Diagram view"
      data-part="canvas-controls"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="group"
      className={cn(classNames.canvasControls, className)}
      {...props}
    >
      {children ?? (
        <>
          <Control action="zoom-out" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
            <ZoomOutIcon />
          </Control>
          {/* The visible string is contained in the accessible name (WCAG 2.5.3). */}
          <Control
            action="reset"
            aria-label={`Reset zoom, currently ${zoomPercent}%`}
            onClick={reset}
          >
            <span className={classNames.canvasZoom} data-part="canvas-zoom">
              {zoomPercent}%
            </span>
          </Control>
          <Control action="zoom-in" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
            <ZoomInIcon />
          </Control>
          <Control action="fit" aria-label="Fit diagram to view" onClick={fit}>
            <FitIcon />
          </Control>
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------------------- canvas

export interface DiagramCanvasProps extends useRender.ComponentProps<'div'> {
  /** Replaces the control cluster, or removes it with `false`. Rendered outside the transform. */
  controls?: ReactNode | false;
  /** Accessible name for the *view*; the drawing keeps its own name on the SVG. */
  label?: string;
}

export function Canvas({
  controls,
  label = DEFAULT_LABEL,
  className,
  render,
  children,
  ref: forwardedRef,
  ...props
}: DiagramCanvasProps) {
  const { classNames } = useDiagramConfig();
  const { scene } = useDiagramScene();
  const canvas = useCanvas(scene);

  const own: PartProps<'div'> = {
    'aria-label': label,
    'data-animate': canvas.animate ? '' : undefined,
    'data-panning': canvas.panning ? '' : undefined,
    'data-part': 'canvas',
    // Not `role="application"`: the text alternative is `Diagram.Description` in browse mode, and
    // trading that for arrow-key panning would be a bad deal for a screen reader user.
    role: 'group',
    tabIndex: 0,
    className: cn(classNames.canvas, className),
    style: canvas.style,
    ...canvas.handlers,
    children: (
      <DiagramCanvasProvider value={canvas.context}>
        <div className={classNames.canvasScene} data-part="canvas-scene">
          {children}
        </div>
        {controls === false ? null : (controls ?? <CanvasControls />)}
      </DiagramCanvasProvider>
    ),
  };

  return useRender({
    defaultTagName: 'div',
    render,
    ref: forwardedRef ? [canvas.ref, forwardedRef] : canvas.ref,
    // Merged, not spread: a caller's `style` has to land beside the pan/zoom custom properties
    // rather than replace them, and a caller's handler has to run alongside the interaction rather
    // than delete it.
    props: mergeProps<'div'>(own, props),
  });
}
