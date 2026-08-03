import { useStateStore, useStateValue } from '@json-render/react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Checklist'>;
type Item = Props['items'][number];

/**
 * Without `onCheckedChange` the item is display-only: `readOnly` (not `disabled`) keeps it in the
 * accessibility tree and undimmed, since it is static content rather than a blocked control.
 */
function ChecklistItem({
  checked,
  onCheckedChange,
  text,
}: {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  text: string;
}) {
  return (
    <li className="m-0 ps-0">
      {/* items-start + box offset: keeps the box on the first line when the text wraps (mt-1
          centers the 16px box in the 24px base line). */}
      <label className={cn('flex items-start gap-3', onCheckedChange && 'cursor-pointer')}>
        <Checkbox
          checked={checked}
          className="mt-1"
          onCheckedChange={onCheckedChange}
          readOnly={!onCheckedChange}
        />
        <span className={cn(checked && 'text-foreground-muted line-through')}>{text}</span>
      </label>
    </li>
  );
}

/**
 * Interactive item: checked lives in the json-render state store (persisted per artifact); the
 * spec's `checked` is only the default before first use.
 */
function StatefulItem({ item, statePath }: { item: Item; statePath: string }) {
  const { set } = useStateStore();
  const stored = useStateValue<boolean>(statePath);
  // State is keyed per artifact, not per version, so a later version can point a different
  // component type at this path — anything but a boolean falls back to the spec's default.
  const checked = typeof stored === 'boolean' ? stored : Boolean(item.checked);

  return (
    <ChecklistItem
      checked={checked}
      onCheckedChange={(value) => set(statePath, value)}
      text={item.text}
    />
  );
}

export function Checklist({ props }: { props: Props }) {
  return (
    <ul className={cn('m-0 flex list-none flex-col gap-2 p-0', flowBlock)}>
      {props.items.map((item) =>
        item.statePath ? (
          <StatefulItem item={item} key={item.id} statePath={item.statePath} />
        ) : (
          <ChecklistItem checked={Boolean(item.checked)} key={item.id} text={item.text} />
        ),
      )}
    </ul>
  );
}
