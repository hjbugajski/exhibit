import type { CatalogComponentProps } from '@/catalog/catalog';
import { Progress as ProgressPrimitive } from '@/components/ui/progress';

type Props = CatalogComponentProps<'Progress'>;

export function Progress({ props }: { props: Props }) {
  return (
    <ProgressPrimitive.Root value={props.value} aria-label={props.label ?? 'Progress'}>
      {props.label ? <ProgressPrimitive.Label>{props.label}</ProgressPrimitive.Label> : null}
      <ProgressPrimitive.Value />
    </ProgressPrimitive.Root>
  );
}
