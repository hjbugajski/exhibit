import type { CatalogComponentProps } from '@/catalog/catalog';
import { OrderedEntry } from '@/components/catalog/ordered-entry';

type Props = CatalogComponentProps<'Steps'>;

export function Steps({ props }: { props: Props }) {
  return (
    <ol className="flex flex-col">
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
