// @vitest-environment happy-dom
import { useState } from 'react';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDestructiveAction } from '@/components/blocks/confirm-destructive-action';
import { useFormAction } from '@/lib/use-form-action';

function Harness({ confirmation, onConfirm }: { confirmation?: string; onConfirm: () => void }) {
  const [open, setOpen] = useState(true);
  const action = useFormAction();

  return (
    <ConfirmDestructiveAction
      action={action}
      actionLabel="Delete"
      confirmation={confirmation}
      description="Description."
      onConfirm={onConfirm}
      onOpenChange={setOpen}
      open={open}
      pendingLabel="Deleting…"
      title="Delete artifact"
    />
  );
}

afterEach(cleanup);

describe('ConfirmDestructiveAction', () => {
  it('keeps the confirm action disabled until the confirmation is checked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness confirmation="I understand this can’t be undone." onConfirm={onConfirm} />);

    const confirmButton = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    fireEvent.click(confirmButton);
    expect(onConfirm).not.toHaveBeenCalled();

    // userEvent, not fireEvent — see the Checklist test in src/catalog/registry.unit.test.tsx.
    await user.click(screen.getByRole('checkbox'));
    expect(confirmButton.disabled).toBe(false);

    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('enables the confirm action immediately without a confirmation', () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    expect(screen.queryByRole('checkbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
