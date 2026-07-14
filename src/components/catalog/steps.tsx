import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';
import { OrderedEntry } from '@/components/catalog/ordered-entry';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Steps'>;

export function Steps({ props }: { props: Props }) {
  return (
    <ol className={cn('flex flex-col', flowBlock)}>
      {props.items.map((item, index) => (
        <OrderedEntry
          key={item.id}
          marker={
            <span className="bg-accent-subtle text-accent flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
              {index + 1}
            </span>
          }
          markdown={item.markdown}
          title={item.title}
        />
      ))}
    </ol>
  );
}
