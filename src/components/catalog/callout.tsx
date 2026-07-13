import type { CatalogComponentProps } from '@/catalog/catalog';
import { MarkdownBody } from '@/components/catalog/markdown-body';
import { Alert } from '@/components/ui/alert';

type Props = CatalogComponentProps<'Callout'>;

export function Callout({ props }: { props: Props }) {
  // Only warning/danger are urgent enough to interrupt a screen reader; the rest are informational
  // and should announce politely once the reader is idle.
  const role = props.variant === 'warning' || props.variant === 'danger' ? 'alert' : 'status';

  return (
    <Alert.Root role={role} variant={props.variant}>
      {props.title ? <Alert.Title>{props.title}</Alert.Title> : null}
      <Alert.Description>
        <MarkdownBody markdown={props.markdown} />
      </Alert.Description>
    </Alert.Root>
  );
}
