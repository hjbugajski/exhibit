import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';
import { OrderedEntry } from '@/components/catalog/ordered-entry';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Timeline'>;

export function Timeline({ props }: { props: Props }) {
  return (
    <ol className={cn('flex flex-col', flowBlock)}>
      {props.items.map((item) => (
        <OrderedEntry
          key={item.id}
          label={
            /* Block, not inline: an inline label sits in a line box inflated
               to the parent's 24px strut, dragging the first line (and the
               dot centered on it) out of alignment. */
            <span className="text-foreground-muted block text-xs">{item.label}</span>
          }
          marker={<span aria-hidden className="bg-accent mt-0.5 size-3 rounded-full" />}
          markdown={item.markdown}
          title={item.title}
        />
      ))}
    </ol>
  );
}
