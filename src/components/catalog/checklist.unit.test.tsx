// @vitest-environment happy-dom
import { createStateStore, StateProvider } from '@json-render/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CatalogComponentProps } from '@/catalog/catalog';
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

  /** Non-boolean stored values must fall back to the spec default — rationale in checklist.tsx. */
  it.each([{ stored: 'yes' }, { stored: 1 }, { stored: null }, { stored: { nested: true } }])(
    'falls back to the spec default for a stored value of $stored',
    ({ stored }) => {
      expect(renderChecklist(stored).getAttribute('aria-checked')).toBe('false');
      cleanup();
      expect(renderChecklist(stored, true).getAttribute('aria-checked')).toBe('true');
    },
  );

  /** Display-only items are content, not blocked controls: readable, not dimmed. */
  it('renders a display-only item as read-only rather than disabled', () => {
    const props: CatalogComponentProps<'Checklist'> = {
      items: [{ id: 'i1', text: 'Order cabinets', checked: true }],
    };

    render(<Checklist props={props} />);

    const checkbox = screen.getByRole('checkbox', { name: 'Order cabinets' });

    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect(checkbox.getAttribute('aria-disabled')).toBeNull();
    expect(checkbox.hasAttribute('data-disabled')).toBe(false);
    expect(checkbox.getAttribute('aria-readonly')).toBe('true');
  });
});
