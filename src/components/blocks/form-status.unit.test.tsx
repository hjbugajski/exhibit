// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FormStatus } from '@/components/blocks/form-status';

afterEach(() => {
  cleanup();
});

describe('FormStatus', () => {
  it('interrupts for an error', () => {
    render(<FormStatus status={{ kind: 'error', message: 'Something broke.' }} />);

    expect(screen.getByRole('alert').textContent).toBe('Something broke.');
  });

  it('announces politely for a success', () => {
    render(<FormStatus status={{ kind: 'success', message: 'Saved.' }} />);

    expect(screen.getByRole('status').textContent).toBe('Saved.');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
