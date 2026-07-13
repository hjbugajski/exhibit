import type { CatalogComponentProps } from '@/catalog/catalog';
import { MarkdownBody } from '@/components/catalog/markdown-body';

type Props = CatalogComponentProps<'Prose'>;

export function Prose({ props }: { props: Props }) {
  return <MarkdownBody markdown={props.markdown} size="base" />;
}
