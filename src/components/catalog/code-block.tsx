import type { CatalogComponentProps } from '@/catalog/catalog';
import { CopyButton } from '@/components/blocks/copy-button';
import { HighlightedCode } from '@/components/blocks/highlighted-code';
import { flowBlock } from '@/components/catalog/flow';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'CodeBlock'>;

export function CodeBlock({ props }: { props: Props }) {
  return (
    <div className={cn('border-border overflow-hidden rounded-lg border', flowBlock)}>
      <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-1.5">
        <span className="text-foreground-muted font-mono text-xs">
          {props.filename ?? props.language ?? 'code'}
        </span>
        <div className="flex items-center gap-2">
          {props.filename && props.language ? (
            <span className="text-foreground-muted text-xs">{props.language}</span>
          ) : null}
          <CopyButton label="Copy code" text={props.code} />
        </div>
      </div>
      <HighlightedCode
        className="bg-background overflow-x-auto p-4 text-sm"
        code={props.code}
        language={props.language}
      />
    </div>
  );
}
