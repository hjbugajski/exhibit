import { useEffect, useState } from 'react';

export type CopyStatus = 'idle' | 'copied' | 'failed';

/**
 * Clipboard write with a self-resetting status for copy-button icons. `copy` never rejects —
 * failure surfaces as the `failed` status. Each call restarts the 1.5s reset timer, and the timer
 * is cleaned up on unmount.
 */
export function useCopyToClipboard() {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [copyTick, setCopyTick] = useState(0);

  useEffect(() => {
    if (copyTick === 0) {
      return;
    }

    const id = setTimeout(() => setCopyStatus('idle'), 1500);

    return () => clearTimeout(id);
  }, [copyTick]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    } finally {
      setCopyTick((tick) => tick + 1);
    }
  }

  return { copyStatus, copy };
}
