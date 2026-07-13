// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Progress } from '@/components/catalog/progress';

afterEach(() => {
  cleanup();
});

describe('Progress', () => {
  it('falls back to a generic accessible name when no label is given', () => {
    render(<Progress props={{ value: 42 }} />);

    expect(screen.getByRole('progressbar', { name: 'Progress' })).toBeTruthy();
  });

  it('uses the given label as the accessible name', () => {
    render(<Progress props={{ label: 'Demo phase', value: 42 }} />);

    expect(screen.getByRole('progressbar', { name: 'Demo phase' })).toBeTruthy();
  });
});
