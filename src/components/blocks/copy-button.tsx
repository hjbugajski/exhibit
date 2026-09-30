import { Check, Copy, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/lib/use-copy-to-clipboard';

/**
 * Icon-only copy control. The name stays `label` throughout; the result is announced through a
 * live region that stays mounted, because a region that mounts with its text is often skipped.
 */
export function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const { copyStatus, copy } = useCopyToClipboard();

  return (
    <>
      <Button
        aria-label={label}
        className={className}
        onClick={() => {
          void copy(text);
        }}
        variant="ghost"
      >
        {copyStatus === 'copied' ? (
          <Check data-icon="only" />
        ) : copyStatus === 'failed' ? (
          <X data-icon="only" />
        ) : (
          <Copy data-icon="only" />
        )}
      </Button>
      <output className="sr-only">
        {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : ''}
      </output>
    </>
  );
}
