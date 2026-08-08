import { catalogDemo } from '@/components/library/catalog-demo';

const code = `export function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}`;

export const catalogCodeBlockDemo = catalogDemo({
  slug: 'catalog-code-block',
  title: 'Code block',
  description: 'Standalone code block with an optional filename header and a copy button.',
  controls: {
    language: { kind: 'text', label: 'Language', defaultValue: 'ts' },
    filename: { kind: 'text', label: 'Filename', defaultValue: 'format-currency.ts' },
  },
  element: (values) => ({
    type: 'CodeBlock',
    props: { code, language: values.language, filename: values.filename },
  }),
});
