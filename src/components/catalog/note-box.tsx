import { useStateStore, useStateValue } from '@json-render/react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { Textarea } from '@/components/ui/textarea';

type Props = CatalogComponentProps<'NoteBox'>;

/**
 * Free-form note; the text lives in the json-render state store (persisted per artifact, debounced
 * by the artifact detail view).
 */
export function NoteBox({ props }: { props: Props }) {
  const { set } = useStateStore();
  const stored = useStateValue<string>(props.statePath);

  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{props.label}</span>
      <Textarea
        onChange={(event) => set(props.statePath, event.target.value)}
        placeholder={props.placeholder}
        value={stored ?? ''}
      />
    </label>
  );
}
