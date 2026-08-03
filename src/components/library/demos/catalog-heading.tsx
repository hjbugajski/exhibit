import { catalogDemo } from '@/components/library/catalog-demo';

const levels = ['1', '2', '3'] as const;

export const catalogHeadingDemo = catalogDemo({
  slug: 'catalog-heading',
  title: 'Heading',
  description: 'Standalone heading, independent of Section titles; use sparingly.',
  controls: {
    level: { kind: 'select', label: 'Level', options: levels, defaultValue: '2' },
    text: { kind: 'text', label: 'Text', defaultValue: 'Getting Started' },
  },
  element: (values) => ({
    type: 'Heading',
    props: { level: Number(values.level), text: values.text },
  }),
});
