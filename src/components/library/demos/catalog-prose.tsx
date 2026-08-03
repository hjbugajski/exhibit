import { catalogDemo } from '@/components/library/catalog-demo';

export const catalogProseDemo = catalogDemo({
  slug: 'catalog-prose',
  title: 'Prose',
  description: 'Markdown-rendered body text — the primary workhorse for free-form writing.',
  controls: {
    markdown: {
      kind: 'text',
      label: 'Markdown',
      defaultValue:
        'The trailhead opens at **6 AM** — see the [park bulletin](https://example.com).',
    },
  },
  element: (values) => ({ type: 'Prose', props: { markdown: values.markdown } }),
});
