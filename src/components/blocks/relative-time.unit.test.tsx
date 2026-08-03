// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RelativeTime } from '@/components/blocks/relative-time';

afterEach(() => {
  cleanup();
});

describe('RelativeTime', () => {
  it('renders the relative form as text and the machine/absolute forms as attributes', () => {
    const value = Date.now() - 3 * 60 * 60 * 1000;

    render(<RelativeTime value={value} />);

    const element = screen.getByText('3h ago');

    expect(element.tagName).toBe('TIME');
    expect(element.getAttribute('datetime')).toBe(new Date(value).toISOString());
    expect(element.getAttribute('title')).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      ),
    );
  });
});
