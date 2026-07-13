import { Alert } from '@/components/ui/alert';
import type { ActionStatus } from '@/lib/use-form-action';

export function FormStatus({ status }: { status: ActionStatus | null }) {
  if (!status) {
    return null;
  }

  return (
    <Alert.Root variant={status.kind === 'error' ? 'danger' : 'success'}>
      <Alert.Description>{status.message}</Alert.Description>
    </Alert.Root>
  );
}
