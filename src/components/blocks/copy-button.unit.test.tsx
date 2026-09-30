// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CopyButton } from '@/components/blocks/copy-button';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CopyButton', () => {
  it('renders an empty status region before the first click', () => {
    render(<CopyButton label="Copy code" text="pnpm gate" />);

    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('copies the text and announces the result under a constant name', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<CopyButton label="Copy code" text="pnpm gate" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Copied'));
    expect(writeText).toHaveBeenCalledWith('pnpm gate');
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy();
  });

  it('announces a failed clipboard write', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<CopyButton label="Copy code" text="pnpm gate" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Copy failed'));
  });
});
