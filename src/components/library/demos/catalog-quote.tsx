import { catalogDemo } from '@/components/library/catalog-demo';

export const catalogQuoteDemo = catalogDemo({
  slug: 'catalog-quote',
  title: 'Quote',
  description: 'Block quotation, optionally attributed, for a notable quote from a source.',
  controls: {
    markdown: {
      kind: 'text',
      label: 'Markdown',
      defaultValue: 'The best time to plant a tree was 20 years ago; the second best time is now.',
    },
    attribution: { kind: 'text', label: 'Attribution', defaultValue: 'Chinese proverb' },
  },
  element: (values) => ({
    type: 'Quote',
    props: { markdown: values.markdown, attribution: values.attribution },
  }),
});
