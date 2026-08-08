import { catalogDemo } from '@/components/library/catalog-demo';

export const catalogDetailsDemo = catalogDemo({
  slug: 'catalog-details',
  title: 'Details',
  description: 'Collapsible disclosure, collapsed by default, for optional detail or fine print.',
  controls: {
    summary: { kind: 'text', label: 'Summary', defaultValue: 'Cancellation policy' },
    markdown: {
      kind: 'text',
      label: 'Markdown',
      defaultValue: 'Free cancellation up to **48 hours** before check-in.',
    },
  },
  element: (values) => ({
    type: 'Details',
    props: { summary: values.summary, markdown: values.markdown },
  }),
});
