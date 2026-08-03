import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';
import { MarkdownBody } from '@/components/catalog/markdown-body';
import { Alert } from '@/components/ui/alert';

type Props = CatalogComponentProps<'Callout'>;

export function Callout({ props }: { props: Props }) {
  // No live-region role: artifacts render client-side, so a live region would make this static
  // document copy announce on insertion. The variant is carried by the title and styling.
  return (
    <Alert.Root className={flowBlock} render={<aside />} variant={props.variant}>
      {props.title ? <Alert.Title>{props.title}</Alert.Title> : null}
      <Alert.Description>
        <MarkdownBody markdown={props.markdown} />
      </Alert.Description>
    </Alert.Root>
  );
}
