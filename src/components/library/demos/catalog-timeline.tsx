import { catalogDemo } from '@/components/library/catalog-demo';

export const catalogTimelineDemo = catalogDemo({
  slug: 'catalog-timeline',
  title: 'Timeline',
  description: 'Chronological sequence of dated entries — a history, schedule, or event log.',
  element: {
    type: 'Timeline',
    props: {
      items: [
        {
          id: 'founded',
          label: 'March 2021',
          title: 'Company founded',
          markdown: 'Started as a two-person team out of a Kyoto co-working space.',
        },
        {
          id: 'seed',
          label: 'January 2022',
          title: 'Seed round closed',
          markdown: '$3.2M led by **Northgate Ventures**.',
        },
        { id: 'launch', label: 'August 2023', title: 'Public launch' },
        {
          id: 'series-a',
          label: 'June 2025',
          title: 'Series A',
          markdown: '$18M to expand into the EU market.',
        },
      ],
    },
  },
});
