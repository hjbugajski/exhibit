import { useState, type ReactElement, type ReactNode } from 'react';

import { FormStatus } from '@/components/blocks/form-status';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import type { useFormAction } from '@/lib/use-form-action';

export interface ConfirmDestructiveActionProps {
  /**
   * The element that opens the dialog, e.g. `<Button variant="destructive" />` with the caller's
   * own `disabled` already applied. Spread into `AlertDialog.Trigger`'s `render`; its label
   * comes from `actionLabel` / `pendingLabel` below, same as the confirm action. Omit when the
   * opener lives elsewhere (e.g. a menu item) and drive `open`/`onOpenChange` instead.
   */
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  /** Label for both the trigger and the confirm action when idle. */
  actionLabel: string;
  /** Label for both the trigger and the confirm action while `action.pending`. */
  pendingLabel: string;
  /**
   * The `useFormAction()` return value — drives the pending/disabled state and the status message;
   * the mutation itself is `onConfirm`.
   */
  action: ReturnType<typeof useFormAction>;
  /** Called when the confirm action is clicked. Expected to call `action.run(...)`. */
  onConfirm: () => void;
  /**
   * Checkbox label. When set, the confirm action stays disabled until the checkbox is checked;
   * the checkbox resets whenever the dialog opens or closes.
   */
  confirmation?: ReactNode;
}

/**
 * Shared alert-dialog chrome for a destructive confirm flow (delete artifact, revoke MCP
 * connection, …): trigger and confirm button share one label pair that swaps to `pendingLabel`
 * while the action is in flight.
 */
export function ConfirmDestructiveAction({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  pendingLabel,
  action,
  onConfirm,
  confirmation,
}: ConfirmDestructiveActionProps) {
  const [confirmed, setConfirmed] = useState(false);

  function handleOpenChange(next: boolean) {
    setConfirmed(false);
    onOpenChange?.(next);
  }

  return (
    <AlertDialog.Root onOpenChange={handleOpenChange} open={open}>
      {trigger ? (
        <AlertDialog.Trigger render={trigger}>
          {action.pending ? pendingLabel : actionLabel}
        </AlertDialog.Trigger>
      ) : null}
      <AlertDialog.Portal>
        <AlertDialog.Overlay />
        <AlertDialog.Popup>
          <AlertDialog.Header>
            <AlertDialog.Title>{title}</AlertDialog.Title>
            <AlertDialog.Description>{description}</AlertDialog.Description>
          </AlertDialog.Header>
          {confirmation != null ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              {confirmation}
            </label>
          ) : null}
          <FormStatus status={action.status} />
          <AlertDialog.Footer>
            <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
            <AlertDialog.Action
              disabled={action.pending || (confirmation != null && !confirmed)}
              onClick={onConfirm}
              variant="destructive"
            >
              {action.pending ? pendingLabel : actionLabel}
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
