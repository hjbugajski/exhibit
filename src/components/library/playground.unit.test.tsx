// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Playground } from '@/components/library/playground';

afterEach(() => {
  cleanup();
});

describe('Playground', () => {
  it('re-renders with the toggled value when a boolean control changes', async () => {
    const renderSpy = vi.fn(() => null);
    render(
      <Playground
        controls={{ disabled: { kind: 'boolean', label: 'Disabled', defaultValue: false } }}
        render={renderSpy}
      />,
    );

    expect(renderSpy).toHaveBeenLastCalledWith({ disabled: false });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Disabled' }));

    expect(renderSpy).toHaveBeenLastCalledWith({ disabled: true });
  });

  it('re-renders with the typed value when a text control changes', () => {
    const renderSpy = vi.fn(() => null);
    render(
      <Playground
        controls={{ label: { kind: 'text', label: 'Label', defaultValue: 'Button' } }}
        render={renderSpy}
      />,
    );

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Save' } });

    expect(renderSpy).toHaveBeenLastCalledWith({ label: 'Save' });
  });

  it('re-renders with the picked option when a select control changes', async () => {
    const renderSpy = vi.fn(() => null);
    render(
      <Playground
        controls={{
          variant: {
            kind: 'select',
            label: 'Variant',
            options: ['default', 'outline'],
            defaultValue: 'default',
          },
        }}
        render={renderSpy}
      />,
    );

    expect(renderSpy).toHaveBeenLastCalledWith({ variant: 'default' });

    await userEvent.click(screen.getByLabelText('Variant'));
    await userEvent.click(await screen.findByRole('option', { name: 'outline' }));

    expect(renderSpy).toHaveBeenLastCalledWith({ variant: 'outline' });
  });
});
