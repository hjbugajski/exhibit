// @vitest-environment happy-dom

import { renderToStaticMarkup } from 'react-dom/server';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RelativeTime } from '@/components/blocks/relative-time';

afterEach(() => {
  cleanup();
});

describe('RelativeTime', () => {
  it('renders the relative form as text and the machine form as an attribute', () => {
    const value = Date.now() - 3 * 60 * 60 * 1000;

    render(<RelativeTime value={value} />);

    const element = screen.getByText('3h ago');

    expect(element.tagName).toBe('TIME');
    expect(element.getAttribute('datetime')).toBe(new Date(value).toISOString());
  });

  it('omits the title server-side, where the locale and timezone are the container’s', () => {
    const markup = renderToStaticMarkup(<RelativeTime value={Date.now() - 3 * 60 * 60 * 1000} />);

    expect(markup).not.toContain('title=');
  });

  it('formats the title after mount', () => {
    const value = Date.now() - 3 * 60 * 60 * 1000;

    render(<RelativeTime value={value} />);

    expect(screen.getByText('3h ago').getAttribute('title')).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      ),
    );
  });
});
