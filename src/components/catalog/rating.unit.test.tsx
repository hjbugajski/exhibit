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
