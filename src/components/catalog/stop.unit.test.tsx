// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Stop } from '@/components/catalog/stop';

afterEach(() => {
  cleanup();
});

describe('Stop', () => {
  it('links the title to an http(s) url in a new tab', () => {
    render(<Stop props={{ title: 'Omen', url: 'https://example.com/omen' }} />);

    const link = screen.getByRole('link', { name: 'Omen' });

    expect(link.getAttribute('href')).toBe('https://example.com/omen');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders the title as plain text for a non-http(s) url', () => {
    render(<Stop props={{ title: 'Omen', url: 'javascript:alert(1)' }} />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Omen')).toBeTruthy();
  });

  it.each([
    ['booked', 'Booked'],
    ['planned', 'Planned'],
    ['optional', 'Optional'],
  ] as const)('labels status %s as %s', (status, label) => {
    render(<Stop props={{ title: 'Omen', status }} />);

    expect(screen.getByText(label)).toBeTruthy();
  });

  it('renders cost verbatim', () => {
    render(<Stop props={{ title: 'Omen', cost: '¥1,500' }} />);

    expect(screen.getByText('¥1,500')).toBeTruthy();
  });

  it('renders the transit mode with its duration', () => {
    render(<Stop props={{ title: 'Omen', transit: { mode: 'walk', duration: '15 min' } }} />);

    expect(screen.getByText('Walk · 15 min')).toBeTruthy();
  });

  it('renders the transit mode label alone without a duration', () => {
    render(<Stop props={{ title: 'Omen', transit: { mode: 'transit' } }} />);

    expect(screen.getByText('Transit')).toBeTruthy();
  });

  it('renders no connector without transit', () => {
    const { container } = render(<Stop props={{ title: 'Omen' }} />);

    expect(container.firstElementChild?.getAttribute('data-slot')).toBe('card');
  });

  it.each(['hike', 'shopping'] as const)('renders kind %s', (kind) => {
    const { container } = render(<Stop props={{ title: 'Stop', kind }} />);

    expect(
      container.querySelector(`svg.lucide-${kind === 'hike' ? 'mountain' : 'shopping-bag'}`),
    ).toBeTruthy();
  });
});
