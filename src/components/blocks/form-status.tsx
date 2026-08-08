import { Alert } from '@/components/ui/alert';
import type { ActionStatus } from '@/lib/use-form-action';

export function FormStatus({ status }: { status: ActionStatus | null }) {
  if (!status) {
    return null;
  }

  return (
    // The message appears in response to a submit, so it is a live region: errors interrupt,
    // successes announce politely.
    <Alert.Root
      role={status.kind === 'error' ? 'alert' : 'status'}
      variant={status.kind === 'error' ? 'danger' : 'success'}
    >
      <Alert.Description>{status.message}</Alert.Description>
    </Alert.Root>
  );
}
