import { useState } from 'react';

export interface ActionStatus {
  kind: 'success' | 'error';
  message: string;
}

/**
 * Wraps an async UI action with pending/status tracking so a thrown error can never leave a button
 * stuck disabled: `run` sets pending, clears the previous status, awaits `fn`, and always clears
 * pending in a `finally`. A thrown error becomes an error status automatically; the success path
 * (and business-logic errors returned as data rather than thrown) is left to the caller via
 * `setStatus`.
 */
export function useFormAction() {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<ActionStatus | null>(null);

  async function run(fn: () => Promise<void>): Promise<void> {
    setPending(true);
    setStatus(null);

    try {
      await fn();
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Something went wrong.',
      });
    } finally {
      setPending(false);
    }
  }

  return { pending, status, setStatus, run };
}
