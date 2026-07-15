import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';
import { MarkdownBody } from '@/components/catalog/markdown-body';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Quote'>;

export function Quote({ props }: { props: Props }) {
  return (
    /* The bar mirrors the Alert bar geometry (2px, fully rounded, left-2,
       text at pl-5) so a stacked Quote and Callout read as one aligned rail. */
    <blockquote
      className={cn(
        'before:bg-accent relative pl-5 before:absolute before:inset-y-0 before:left-2 before:w-0.5 before:rounded-full',
        flowBlock,
      )}
    >
      <MarkdownBody className="italic" markdown={props.markdown} size="lg" />
      {props.attribution ? (
        <footer className="text-foreground-muted mt-2 text-sm not-italic">
          — {props.attribution}
        </footer>
      ) : null}
    </blockquote>
  );
}
