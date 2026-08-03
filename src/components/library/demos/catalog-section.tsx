import { catalogDemo } from '@/components/library/catalog-demo';

export const catalogSectionDemo = catalogDemo({
  slug: 'catalog-section',
  title: 'Section',
  description: 'Top-level page section with an anchor; groups related content under a title.',
  controls: {
    title: { kind: 'text', label: 'Title', defaultValue: 'Plan Comparison' },
    subtitle: { kind: 'text', label: 'Subtitle', defaultValue: 'Pick the tier that fits' },
  },
  root: 'section',
  elements: (values) => ({
    section: {
      type: 'Section',
      props: { title: values.title, subtitle: values.subtitle },
      children: ['prose'],
    },
    prose: {
      type: 'Prose',
      props: { markdown: 'All plans include unlimited projects and **priority email support**.' },
    },
  }),
});
