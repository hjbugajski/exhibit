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
  });

  /** The group name must not carry the value — a name that mutates on every change is announced anew. */
  it('names the group with the label alone, whatever the value', async () => {
    const user = userEvent.setup();
    const store = createStateStore({});

    render(
      <StateProvider store={store}>
        <Rating props={{ label: 'Draft 1', statePath: '/ratings/draft-1' }} />
      </StateProvider>,
    );

    expect(screen.getByRole('radiogroup', { name: 'Draft 1' })).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: '3 of 5 stars' }));

    expect(store.getSnapshot()).toEqual({ ratings: { 'draft-1': 3 } });
    expect(screen.getByRole('radiogroup', { name: 'Draft 1' })).toBeTruthy();
  });

  it('clears the rating when the checked star is re-clicked with a pointer', async () => {
    const user = userEvent.setup();
    const store = createStateStore({});

    render(
      <StateProvider store={store}>
        <Rating props={{ label: 'Draft 1', statePath: '/ratings/draft-1' }} />
      </StateProvider>,
    );

    // The visible star, not the 1px radio — this is the element a pointer user actually hits.
    const fourthStar = document.querySelectorAll('label svg')[3] as Element;

    await user.click(fourthStar);
    expect(store.getSnapshot()).toEqual({ ratings: { 'draft-1': 4 } });

    await user.click(fourthStar);
    expect(store.getSnapshot()).toEqual({ ratings: { 'draft-1': 0 } });
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
