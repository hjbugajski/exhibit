// @vitest-environment happy-dom
/*
 * Canvas mode wiring. The math is proven in `canvas-transform.unit.test.ts`; this file proves that
 * the events reach it, that the result lands in the custom properties the stylesheet reads, and
 * that the two interaction rules the embed contract depends on hold — plain wheel is the page's,
 * and a press on the controls is never a drag.
 *
 * happy-dom has no layout, so `clientWidth`/`clientHeight` are stubbed where a test needs a
 * measured viewport, and everything about actual painting (grid alignment, focus ring, animation)
 * is left to the browser pass.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Diagram } from './diagram';

afterEach(() => {
  cleanup();
});

const SOURCE = 'flowchart TD\n  A[Start] --> B[Middle]\n  B --> C[End]';

function renderCanvas(props: { source?: string } = {}) {
  const view = render(
    <Diagram.Root source={props.source ?? SOURCE}>
      <Diagram.Canvas>
        <Diagram.Svg />
      </Diagram.Canvas>
    </Diagram.Root>,
  );

  return { ...view, canvas: canvasOf(view.container) };
}

function canvasOf(container: HTMLElement): HTMLElement {
  const canvas = container.querySelector<HTMLElement>('[data-part="canvas"]');

  if (!canvas) {
    throw new Error('no canvas was rendered');
  }

  return canvas;
}

function view(canvas: HTMLElement): { x: string; y: string; k: string; grid: string } {
  return {
    x: canvas.style.getPropertyValue('--diagram-canvas-pan-x'),
    y: canvas.style.getPropertyValue('--diagram-canvas-pan-y'),
    k: canvas.style.getPropertyValue('--diagram-canvas-zoom'),
    grid: canvas.style.getPropertyValue('--diagram-canvas-grid-scale'),
  };
}

function control(action: string): HTMLElement {
  const button = document.querySelector<HTMLElement>(`[data-action="${action}"]`);

  if (!button) {
    throw new Error(`no control for "${action}"`);
  }

  return button;
}

/** happy-dom has no layout: every measured box is zero until something says otherwise. */
function stubViewport(width: number, height: number): () => void {
  const originals = (['clientWidth', 'clientHeight'] as const).map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)] as const,
  );

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => width,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => height,
  });

  return () => {
    for (const [name, descriptor] of originals) {
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, name, descriptor);
      }
    }
  };
}

function press(canvas: HTMLElement, init: KeyboardEventInit): boolean {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

  fireEvent(canvas, event);

  return event.defaultPrevented;
}

/**
 * happy-dom's `WheelEvent` constructor drops everything it inherits from `MouseEventInit` —
 * modifiers and coordinates alike — so those are defined on the instance. Real modifier plumbing
 * is a browser-pass item.
 */
function wheel(canvas: HTMLElement, init: WheelEventInit): boolean {
  const { ctrlKey = false, metaKey = false, clientX = 0, clientY = 0, ...rest } = init;
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...rest });

  for (const [name, value] of Object.entries({ ctrlKey, metaKey, clientX, clientY })) {
    Object.defineProperty(event, name, { value });
  }

  fireEvent(canvas, event);

  return event.defaultPrevented;
}

function pointer(canvas: HTMLElement, type: string, init: PointerEventInit & { target?: Element }) {
  const { target, ...rest } = init;
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    button: 0,
    ...rest,
  });

  fireEvent(target ?? canvas, event);
}

describe('structure', () => {
  it('nests the scene and the controls inside one focusable group', () => {
    const { canvas } = renderCanvas();

    expect(canvas.getAttribute('role')).toBe('group');
    expect(canvas.getAttribute('tabindex')).toBe('0');
    expect(canvas.getAttribute('aria-label')).toMatch(/drag to pan/i);
    expect(canvas.querySelector('[data-part="canvas-scene"] [data-part="svg"]')).not.toBeNull();
    expect(
      [...canvas.querySelectorAll('[data-part="canvas-control"]')].map((button) =>
        button.getAttribute('data-action'),
      ),
    ).toEqual(['zoom-out', 'reset', 'zoom-in', 'fit']);
  });

  it('starts at the identity transform, with no measurement and no NaN', () => {
    const { canvas } = renderCanvas();

    expect(view(canvas)).toEqual({ x: '0px', y: '0px', k: '1', grid: '1' });
    expect(canvas.getAttribute('style')).not.toContain('NaN');
  });

  it('gives every control a button type and hides the glyphs from the a11y tree', () => {
    renderCanvas();

    for (const button of document.querySelectorAll('[data-part="canvas-control"]')) {
      expect(button.getAttribute('type')).toBe('button');
      expect(button.getAttribute('aria-label') ?? button.textContent).toBeTruthy();
    }

    for (const icon of document.querySelectorAll('[data-part="canvas-icon"]')) {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('drops the cluster with controls={false} and replaces it with a node', () => {
    const { container } = render(
      <Diagram.Root source={SOURCE}>
        <Diagram.Canvas controls={false}>
          <Diagram.Svg />
        </Diagram.Canvas>
      </Diagram.Root>,
    );

    expect(container.querySelector('[data-part="canvas-controls"]')).toBeNull();

    cleanup();

    render(
      <Diagram.Root source={SOURCE}>
        <Diagram.Canvas controls={<button type="button">Only mine</button>}>
          <Diagram.Svg />
        </Diagram.Canvas>
      </Diagram.Root>,
    );

    expect(screen.getByRole('button', { name: 'Only mine' })).toBeTruthy();
    expect(document.querySelector('[data-part="canvas-control"]')).toBeNull();
  });

  it('merges a caller style beside the transform properties', () => {
    const { container } = render(
      <Diagram.Root source={SOURCE}>
        <Diagram.Canvas style={{ blockSize: '500px' }}>
          <Diagram.Svg />
        </Diagram.Canvas>
      </Diagram.Root>,
    );
    const canvas = canvasOf(container);

    expect(view(canvas)).toEqual({ x: '0px', y: '0px', k: '1', grid: '1' });
    expect(canvas.style.blockSize).toBe('500px');
  });

  it('keeps panning when the caller passes its own pointer handler', () => {
    const onPointerDown = vi.fn();
    const { container } = render(
      <Diagram.Root source={SOURCE}>
        <Diagram.Canvas onPointerDown={onPointerDown}>
          <Diagram.Svg />
        </Diagram.Canvas>
      </Diagram.Root>,
    );
    const canvas = canvasOf(container);

    pointer(canvas, 'pointerdown', { clientX: 100, clientY: 100 });
    pointer(canvas, 'pointermove', { clientX: 140, clientY: 125 });

    expect(view(canvas)).toMatchObject({ x: '40px', y: '25px' });
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it('draws the svg at natural size inside a canvas and scales it outside one', () => {
    const { canvas } = renderCanvas();
    const inside = canvas.querySelector('[data-part="svg"]');

    expect(inside?.getAttribute('width')).toBeTruthy();
    expect(inside?.getAttribute('height')).toBeTruthy();

    cleanup();

    const { container } = render(
      <Diagram.Root source={SOURCE} fit="scale">
        <Diagram.Svg />
      </Diagram.Root>,
    );

    expect(container.querySelector('[data-part="svg"]')?.getAttribute('width')).toBeNull();
  });
});

describe('controls', () => {
  it('zooms by one step per press and tracks the readout', () => {
    const { canvas } = renderCanvas();

    fireEvent.click(control('zoom-in'));
    expect(view(canvas).k).toBe('1.25');
    expect(control('reset').textContent).toBe('125%');
    expect(control('reset').getAttribute('aria-label')).toBe('Reset zoom, currently 125%');

    fireEvent.click(control('reset'));
    expect(view(canvas).k).toBe('1');

    fireEvent.click(control('zoom-out'));
    expect(view(canvas).k).toBe('0.8');
    expect(control('reset').textContent).toBe('80%');
  });

  it('clamps at both limits however many times it is pressed', () => {
    const { canvas } = renderCanvas();

    for (let press = 0; press < 20; press += 1) {
      fireEvent.click(control('zoom-in'));
    }

    expect(view(canvas).k).toBe('4');

    for (let press = 0; press < 40; press += 1) {
      fireEvent.click(control('zoom-out'));
    }

    expect(view(canvas).k).toBe('0.25');
  });

  it('marks a button-driven change as animated and a drag as not', () => {
    const { canvas } = renderCanvas();

    fireEvent.click(control('zoom-in'));
    expect(canvas.hasAttribute('data-animate')).toBe(true);

    pointer(canvas, 'pointerdown', { clientX: 10, clientY: 10 });
    pointer(canvas, 'pointermove', { clientX: 30, clientY: 10 });
    expect(canvas.hasAttribute('data-animate')).toBe(false);
  });
});

describe('keyboard', () => {
  it('zooms and pans, preventing the default only on the keys it handles', () => {
    const { canvas } = renderCanvas();

    expect(press(canvas, { key: '+' })).toBe(true);
    expect(view(canvas).k).toBe('1.25');

    expect(press(canvas, { key: '-' })).toBe(true);
    expect(view(canvas).k).toBe('1');

    expect(press(canvas, { key: 'ArrowLeft' })).toBe(true);
    expect(view(canvas).x).toBe('32px');

    expect(press(canvas, { key: 'ArrowUp', shiftKey: true })).toBe(true);
    expect(view(canvas).y).toBe('128px');

    expect(press(canvas, { key: 'ArrowRight' })).toBe(true);
    expect(press(canvas, { key: 'ArrowDown' })).toBe(true);
    expect(view(canvas)).toMatchObject({ x: '0px', y: '96px' });

    expect(press(canvas, { key: 'a' })).toBe(false);
  });

  it('accepts the layout-independent codes for zoom', () => {
    const { canvas } = renderCanvas();

    expect(press(canvas, { key: 'Unidentified', code: 'NumpadAdd' })).toBe(true);
    expect(view(canvas).k).toBe('1.25');
  });

  it('leaves modified arrows to the browser', () => {
    const { canvas } = renderCanvas();

    expect(press(canvas, { key: 'ArrowLeft', ctrlKey: true })).toBe(false);
    expect(press(canvas, { key: 'ArrowLeft', metaKey: true })).toBe(false);
    expect(view(canvas).x).toBe('0px');
  });

  it('still pans while a control has focus', () => {
    const { canvas } = renderCanvas();

    expect(press(control('zoom-in'), { key: 'ArrowLeft' })).toBe(true);
    expect(view(canvas).x).toBe('32px');
  });

  it('ignores keys typed into a field inside the canvas', () => {
    render(
      <Diagram.Root source={SOURCE}>
        <Diagram.Canvas>
          <Diagram.Svg />
          <input aria-label="note" />
        </Diagram.Canvas>
      </Diagram.Root>,
    );

    const canvas = canvasOf(document.body);

    expect(press(screen.getByLabelText('note'), { key: '+' })).toBe(false);
    expect(view(canvas).k).toBe('1');
  });
});

describe('wheel', () => {
  it('leaves a plain wheel to the page and zooms on ctrl or meta', () => {
    const { canvas } = renderCanvas();

    expect(wheel(canvas, { deltaY: -100 })).toBe(false);
    expect(view(canvas).k).toBe('1');

    // Anchored on the pointer, not the centre: zooming in at x = 200 pulls the scene left.
    expect(wheel(canvas, { deltaY: -100, ctrlKey: true, clientX: 200, clientY: 100 })).toBe(true);
    expect(Number.parseFloat(view(canvas).k)).toBeGreaterThan(1);
    expect(Number.parseFloat(view(canvas).x)).toBeLessThan(0);
    expect(Number.parseFloat(view(canvas).y)).toBeLessThan(0);

    const zoomedIn = Number.parseFloat(view(canvas).k);

    expect(wheel(canvas, { deltaY: 100, metaKey: true })).toBe(true);
    expect(Number.parseFloat(view(canvas).k)).toBeLessThan(zoomedIn);
  });

  it('never leaves a non-finite value in the style', () => {
    const { canvas } = renderCanvas();

    wheel(canvas, { deltaY: -1e6, ctrlKey: true });

    expect(canvas.getAttribute('style')).not.toContain('NaN');
    expect(Number.parseFloat(view(canvas).k)).toBeLessThanOrEqual(4);
  });
});

describe('pointer', () => {
  it('pans by the pointer delta and flags the drag while it lasts', () => {
    const { canvas } = renderCanvas();

    pointer(canvas, 'pointerdown', { clientX: 100, clientY: 100 });
    expect(canvas.hasAttribute('data-panning')).toBe(true);

    pointer(canvas, 'pointermove', { clientX: 140, clientY: 125 });
    expect(view(canvas)).toMatchObject({ x: '40px', y: '25px' });

    pointer(canvas, 'pointermove', { clientX: 130, clientY: 125 });
    expect(view(canvas)).toMatchObject({ x: '30px', y: '25px' });

    pointer(canvas, 'pointerup', { clientX: 130, clientY: 125 });
    expect(canvas.hasAttribute('data-panning')).toBe(false);

    pointer(canvas, 'pointermove', { clientX: 400, clientY: 400 });
    expect(view(canvas)).toMatchObject({ x: '30px', y: '25px' });
  });

  it('clears the drag on pointercancel', () => {
    const { canvas } = renderCanvas();

    pointer(canvas, 'pointerdown', { clientX: 0, clientY: 0 });
    pointer(canvas, 'pointercancel', { clientX: 0, clientY: 0 });

    expect(canvas.hasAttribute('data-panning')).toBe(false);
  });

  it('ignores a secondary button', () => {
    const { canvas } = renderCanvas();

    pointer(canvas, 'pointerdown', { clientX: 0, clientY: 0, button: 2 });
    pointer(canvas, 'pointermove', { clientX: 50, clientY: 50 });

    expect(canvas.hasAttribute('data-panning')).toBe(false);
    expect(view(canvas).x).toBe('0px');
  });

  it('never turns a press on the controls into a drag, and still fires the control', () => {
    const { canvas } = renderCanvas();
    const button = control('zoom-in');

    pointer(canvas, 'pointerdown', { clientX: 0, clientY: 0, target: button });
    expect(canvas.hasAttribute('data-panning')).toBe(false);

    pointer(canvas, 'pointermove', { clientX: 60, clientY: 60 });
    expect(view(canvas).x).toBe('0px');

    fireEvent.click(button);
    expect(view(canvas).k).toBe('1.25');
  });

  it('pinches two pointers about their midpoint', () => {
    const { canvas } = renderCanvas();

    pointer(canvas, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    pointer(canvas, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });
    pointer(canvas, 'pointermove', { pointerId: 2, clientX: 300, clientY: 100 });

    expect(Number(view(canvas).k)).toBeGreaterThan(1);
  });

  it('keeps the pinched point under the fingers when the midpoint also moves', () => {
    const { canvas } = renderCanvas();

    pointer(canvas, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    pointer(canvas, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });
    // Spread 100 -> 300 (k = 3) while the midpoint slides 150 -> 250: the canvas point under the
    // old midpoint must land under the new one, not twice the delta away.
    pointer(canvas, 'pointermove', { pointerId: 2, clientX: 400, clientY: 100 });

    expect(view(canvas)).toMatchObject({ x: '-200px', y: '-200px', k: '3' });
  });
});

describe('fit', () => {
  it('centres the scene once the viewport measures, and follows the source until the user moves', () => {
    const restore = stubViewport(800, 600);

    try {
      const { canvas, rerender } = renderCanvas();
      const fitted = view(canvas);

      expect(Number.parseFloat(fitted.x)).toBeGreaterThan(0);
      expect(Number.parseFloat(fitted.y)).toBeGreaterThan(0);
      expect(Number.parseFloat(fitted.k)).toBeLessThanOrEqual(1);

      // Untouched: a new source re-fits.
      rerender(
        <Diagram.Root source={'flowchart LR\n  A --> B --> C --> D --> E'}>
          <Diagram.Canvas>
            <Diagram.Svg />
          </Diagram.Canvas>
        </Diagram.Root>,
      );
      expect(view(canvas)).not.toEqual(fitted);

      // Touched: the view is the user's from here.
      pointer(canvas, 'pointerdown', { clientX: 0, clientY: 0 });
      pointer(canvas, 'pointermove', { clientX: 90, clientY: 40 });
      pointer(canvas, 'pointerup', { clientX: 90, clientY: 40 });

      const panned = view(canvas);

      rerender(
        <Diagram.Root source={'flowchart TD\n  X --> Y'}>
          <Diagram.Canvas>
            <Diagram.Svg />
          </Diagram.Canvas>
        </Diagram.Root>,
      );

      expect(view(canvas)).toEqual(panned);

      // The fit button re-fits on demand.
      fireEvent.click(control('fit'));
      expect(view(canvas)).not.toEqual(panned);
    } finally {
      restore();
    }
  });

  it('re-fits on the zero key', () => {
    const restore = stubViewport(800, 600);

    try {
      const { canvas } = renderCanvas();
      const fitted = view(canvas);

      press(canvas, { key: 'ArrowLeft' });
      expect(view(canvas)).not.toEqual(fitted);

      expect(press(canvas, { key: '0' })).toBe(true);
      expect(view(canvas)).toEqual(fitted);
    } finally {
      restore();
    }
  });

  it('writes nothing while the viewport is unmeasurable', () => {
    const { canvas } = renderCanvas();

    fireEvent.click(control('fit'));

    expect(view(canvas)).toEqual({ x: '0px', y: '0px', k: '1', grid: '1' });
  });
});
