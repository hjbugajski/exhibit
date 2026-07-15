import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';
import { MarkdownBody } from '@/components/catalog/markdown-body';

type Props = CatalogComponentProps<'Prose'>;

export function Prose({ props }: { props: Props }) {
  return <MarkdownBody className={flowBlock} markdown={props.markdown} size="base" />;
}
