// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Heading } from '@/components/catalog/heading';

afterEach(() => {
  cleanup();
});

describe('Heading', () => {
  it.each([
    [1, 2, 'text-2xl'],
    [2, 3, 'text-xl'],
    [3, 4, 'text-lg'],
  ] as const)('renders level %i one rank below the page title (h%i, %s)', (level, rank, size) => {
    render(<Heading props={{ level, text: 'Quarterly results' }} />);
    const heading = screen.getByRole('heading', { level: rank, name: 'Quarterly results' });

    expect(heading.classList.contains(size)).toBe(true);
    expect(heading.classList.contains('not-prose')).toBe(true);
    expect(heading.id).toBe('quarterly-results');
  });

  it('renders no id when the text slugifies to nothing', () => {
    render(<Heading props={{ level: 1, text: '日本語' }} />);

    expect(screen.getByRole('heading', { level: 2 }).hasAttribute('id')).toBe(false);
  });
});
