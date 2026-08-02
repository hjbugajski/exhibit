// @vitest-environment happy-dom
import { createStateStore, StateProvider } from '@json-render/react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { Rating } from '@/components/catalog/rating';

afterEach(() => {
  cleanup();
});

describe('Rating', () => {
  /** Stored values clamp to the star range and non-numbers read as unrated — rationale in rating.tsx. */
  it.each([
    { stored: 9999, filled: 5 },
    { stored: -3, filled: 0 },
    { stored: 2.7, filled: 2 },
    { stored: 'four', filled: 0 },
    { stored: Number.NaN, filled: 0 },
    { stored: true, filled: 0 },
  ])('renders $filled stars for a stored value of $stored', ({ stored, filled }) => {
    const store = createStateStore({ ratings: { 'draft-1': stored } });

    render(
      <StateProvider store={store}>
        <Rating props={{ label: 'Draft 1', statePath: '/ratings/draft-1' }} />
      </StateProvider>,
    );

    expect(document.querySelectorAll('.fill-accent')).toHaveLength(filled);
    expect(screen.getByRole('radiogroup').getAttribute('aria-label')).toBe(
      `Draft 1: ${filled} of 5 stars`,
    );
  });

  it('clears the rating when the checked star is re-activated via the keyboard', async () => {
    const user = userEvent.setup();
    const store = createStateStore({});

    render(
      <StateProvider store={store}>
        <Rating props={{ label: 'Draft 1', statePath: '/ratings/draft-1' }} />
      </StateProvider>,
    );

    const fourStars = screen.getByRole('radio', { name: '4 of 5 stars' });

    await user.click(fourStars);
    expect(store.getSnapshot()).toEqual({ ratings: { 'draft-1': 4 } });

    fourStars.focus();
    await user.keyboard(' ');
    expect(store.getSnapshot()).toEqual({ ratings: { 'draft-1': 0 } });
  });
});
