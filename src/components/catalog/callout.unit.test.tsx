// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Callout } from '@/components/catalog/callout';

afterEach(() => {
  cleanup();
});

describe('Callout', () => {
  it('uses role=status (polite) for the info variant', () => {
    render(<Callout props={{ variant: 'info', markdown: 'heads up' }} />);

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps role=alert (assertive) for the warning variant', () => {
    render(<Callout props={{ variant: 'warning', markdown: 'careful' }} />);

    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
