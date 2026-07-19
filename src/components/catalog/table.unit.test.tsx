// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Table } from '@/components/catalog/table';

afterEach(() => {
  cleanup();
});

describe('Table', () => {
  it('renders { text, href } cells as external links and strings as text', () => {
    render(
      <Table
        props={{
          columns: [{ key: 'place', label: 'Place' }],
          rows: [
            { place: { text: 'Kyoto', href: 'https://en.wikivoyage.org/wiki/Kyoto' } },
            { place: 'Osaka' },
          ],
        }}
      />,
    );

    const link = screen.getByRole('link', { name: 'Kyoto' });
    expect(link.getAttribute('href')).toBe('https://en.wikivoyage.org/wiki/Kyoto');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.getByText('Osaka')).toBeTruthy();
  });

  it('degrades a non-http(s) href to plain text', () => {
    render(
      <Table
        props={{
          columns: [{ key: 'place', label: 'Place' }],
          rows: [{ place: { text: 'Kyoto', href: 'javascript:alert(1)' } }],
        }}
      />,
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Kyoto')).toBeTruthy();
  });
});
