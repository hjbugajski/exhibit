// @vitest-environment happy-dom
import { createStateStore, StateProvider } from '@json-render/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Checklist } from '@/components/catalog/checklist';

afterEach(() => {
  cleanup();
});

function renderChecklist(stored: unknown, checked?: boolean) {
  const store = createStateStore({ tasks: { cabinets: stored } });

  render(
    <StateProvider store={store}>
      <Checklist
        props={{
          items: [{ id: 'i1', text: 'Order cabinets', checked, statePath: '/tasks/cabinets' }],
        }}
      />
    </StateProvider>,
  );

  return screen.getByRole('checkbox', { name: 'Order cabinets' });
}

describe('Checklist', () => {
  it('uses a stored boolean', () => {
    expect(renderChecklist(true).getAttribute('aria-checked')).toBe('true');
  });

  /**
   * State is keyed per artifact but not per version, so a later version can point a different
   * component type at the same path — a non-boolean must fall back to the spec's default rather
   * than reach the checkbox.
   */
  it.each([{ stored: 'yes' }, { stored: 1 }, { stored: null }, { stored: { nested: true } }])(
    'falls back to the spec default for a stored value of $stored',
    ({ stored }) => {
      expect(renderChecklist(stored).getAttribute('aria-checked')).toBe('false');
      cleanup();
      expect(renderChecklist(stored, true).getAttribute('aria-checked')).toBe('true');
    },
  );
});
