// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Callout } from '@/components/catalog/callout';

afterEach(() => {
  cleanup();
});

describe('Callout', () => {
  /** Static document copy must not announce when the artifact renders. */
  it.each(['info', 'warning', 'danger'] as const)('is not a live region (%s)', (variant) => {
    render(<Callout props={{ variant, markdown: 'heads up' }} />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('aside')).toBeTruthy();
  });
});
