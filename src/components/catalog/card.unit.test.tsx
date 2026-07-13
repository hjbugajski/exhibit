// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Card } from '@/components/catalog/card';

afterEach(() => {
  cleanup();
});

describe('Card', () => {
  it('renders the badge when title is an empty string', () => {
    render(<Card props={{ title: '', badge: 'Best value' }} />);

    expect(screen.getByText('Best value')).toBeTruthy();
  });
});
