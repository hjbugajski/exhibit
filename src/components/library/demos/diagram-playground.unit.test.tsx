// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { diagramPlaygroundDemo } from '@/components/library/demos/diagram-playground';

afterEach(() => {
  cleanup();
});

describe('diagram playground demo', () => {
  it('renders the first preset on a canvas', () => {
    const { container } = render(diagramPlaygroundDemo.render());

    expect(screen.getByLabelText('Source')).toHaveProperty(
      'value',
      expect.stringContaining('flowchart'),
    );
    expect(container.querySelector('[data-part="canvas"] [data-part="svg"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-part="canvas-control"]').length).toBe(4);
  });

  it('swaps the source and the drawing when a preset is chosen', async () => {
    const { container } = render(diagramPlaygroundDemo.render());

    await userEvent.click(screen.getByRole('button', { name: 'Pie' }));

    expect(screen.getByLabelText('Source')).toHaveProperty('value', expect.stringContaining('pie'));
    expect(container.querySelectorAll('[data-part="slice"]').length).toBe(4);
    expect(container.querySelector('[data-part="legend"]')).not.toBeNull();
  });

  it('keeps the drawing while the mode toggle mounts and unmounts the canvas', async () => {
    const { container } = render(diagramPlaygroundDemo.render());

    await userEvent.click(screen.getByRole('button', { name: 'Static' }));

    expect(container.querySelector('[data-part="canvas"]')).toBeNull();
    expect(container.querySelector('[data-part="svg"]')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Canvas' }));

    expect(container.querySelector('[data-part="canvas"] [data-part="svg"]')).not.toBeNull();
  });

  it('draws what it can and lists what it could not, live from the textarea', async () => {
    const { container } = render(diagramPlaygroundDemo.render());

    await userEvent.click(screen.getByRole('button', { name: 'Broken source' }));

    expect(container.querySelectorAll('[data-part="issue"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-part="node"]').length).toBeGreaterThan(0);

    const textarea = screen.getByLabelText('Source');

    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'flowchart LR{enter}  A --> B');

    expect(container.querySelectorAll('[data-part="issue"]').length).toBe(0);
    expect(container.querySelectorAll('[data-part="node"]').length).toBe(2);
  });
});
