import { ChevronDown } from 'lucide-react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { MarkdownBody } from '@/components/catalog/markdown-body';
import { Card } from '@/components/ui/card';
import { Collapsible } from '@/components/ui/collapsible';

type Props = CatalogComponentProps<'Details'>;

export function Details({ props }: { props: Props }) {
  return (
    <Card.Root className="px-4">
      <Collapsible.Root>
        <Collapsible.Trigger className="group flex w-full items-center justify-between gap-2 text-left font-semibold">
          {props.summary}
          <ChevronDown className="size-3.5 shrink-0 transition-transform group-data-[panel-open]:rotate-180" />
        </Collapsible.Trigger>
        <Collapsible.Content>
          <MarkdownBody className="mt-3" markdown={props.markdown} />
        </Collapsible.Content>
      </Collapsible.Root>
    </Card.Root>
  );
}
