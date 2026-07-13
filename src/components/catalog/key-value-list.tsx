import type { CatalogComponentProps } from '@/catalog/catalog';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'KeyValueList'>;

const colsClass = { 1: 'grid-cols-1', 2: 'sm:grid-cols-2' } as const;

export function KeyValueList({ props }: { props: Props }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-8 gap-y-3', colsClass[props.columns ?? 1])}>
      {props.items.map((item) => (
        <div
          // In two-column mode a trailing odd row would fill only half the
          // width; span it fully instead.
          className="flex flex-col gap-2 sm:last:odd:col-span-full"
          key={item.id}
        >
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-foreground-muted">{item.key}</dt>
            <dd className="text-foreground text-right font-medium">{item.value}</dd>
          </div>
          <Separator />
        </div>
      ))}
    </dl>
  );
}
