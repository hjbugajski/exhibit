// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Tabs } from '@/components/catalog/tabs';

afterEach(() => {
  cleanup();
});

describe('Tabs', () => {
  it('keeps positional item<->panel pairing when a middle child renders null', () => {
    // Mirrors a tab hidden via a spec `visible` binding: the second panel is null, but "Three" must
    // still pair with the third panel by index.
    render(
      <Tabs props={{ items: ['One', 'Two', 'Three'] }}>
        {[<span key="a">Panel A</span>, null, <span key="c">Panel C</span>]}
      </Tabs>,
    );

    fireEvent.click(screen.getByText('Three'));

    expect(screen.getByText('Panel C')).toBeTruthy();
  });
});
