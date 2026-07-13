import type { CatalogComponentProps } from '@/catalog/catalog';
import { Badge as UiBadge } from '@/components/ui/badge';

type Props = CatalogComponentProps<'Badge'>;

export function Badge({ props }: { props: Props }) {
  return <UiBadge variant={props.variant ?? 'default'}>{props.text}</UiBadge>;
}
