// @vitest-environment happy-dom

import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RelativeTime } from '@/components/blocks/relative-time';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

  it('hydrates markup rendered a minute earlier without a mismatch, then shows the client value', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));

    const value = Date.now() - 30 * 1000;
    const container = document.createElement('div');

    container.innerHTML = renderToStaticMarkup(<RelativeTime value={value} />);
    document.body.append(container);
    expect(container.textContent).toBe('just now');

    vi.setSystemTime(Date.now() + 60 * 1000);

    const onRecoverableError = vi.fn();
    const root = await act(async () =>
      hydrateRoot(container, <RelativeTime value={value} />, { onRecoverableError }),
    );

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.textContent).toBe('1m ago');

    act(() => root.unmount());
    container.remove();
  });
});
