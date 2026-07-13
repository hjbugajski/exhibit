import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const spec: Spec = {
  root: 'timeline',
  elements: {
    timeline: {
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
      children: [],
    },
  },
};

function CatalogTimelineDemo() {
  return <Playground controls={{}} layout="block" render={() => <SpecView spec={spec} />} />;
}

export const catalogTimelineDemo: LibraryDemo = {
  slug: 'catalog-timeline',
  title: 'Timeline',
  description: 'Chronological sequence of dated entries — a history, schedule, or event log.',
  group: 'Catalog',
  render: () => <CatalogTimelineDemo />,
};
