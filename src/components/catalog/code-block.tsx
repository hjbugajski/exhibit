import { Check, Copy, X } from 'lucide-react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { Button } from '@/components/ui/button';
import { useCopyToClipboard } from '@/lib/use-copy-to-clipboard';

type Props = CatalogComponentProps<'CodeBlock'>;

export function CodeBlock({ props }: { props: Props }) {
  const { copyStatus, copy } = useCopyToClipboard();

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-1.5">
        <span className="text-foreground-muted font-mono text-xs">
          {props.filename ?? props.language ?? 'code'}
        </span>
        <div className="flex items-center gap-2">
          {props.filename && props.language ? (
            <span className="text-foreground-muted text-xs">{props.language}</span>
          ) : null}
          <Button
            aria-label="Copy code"
            onClick={() => {
              void copy(props.code);
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
        </div>
      </div>
      <pre className="bg-surface-muted overflow-x-auto p-4 text-sm">
        <code>{props.code}</code>
      </pre>
    </div>
  );
}
