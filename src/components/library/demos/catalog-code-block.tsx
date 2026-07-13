import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const code = `export function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}`;

function CatalogCodeBlockDemo() {
  return (
    <Playground
      controls={{
        language: { kind: 'text', label: 'Language', defaultValue: 'ts' },
        filename: { kind: 'text', label: 'Filename', defaultValue: 'format-currency.ts' },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'code',
          elements: {
            code: {
              type: 'CodeBlock',
              props: { code, language: values.language, filename: values.filename },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogCodeBlockDemo: LibraryDemo = {
  slug: 'catalog-code-block',
  title: 'Code block',
  description: 'Standalone code block with an optional filename header and a copy button.',
  group: 'Catalog',
  render: () => <CatalogCodeBlockDemo />,
};
