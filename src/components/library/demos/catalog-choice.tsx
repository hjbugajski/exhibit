import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const spec: Spec = {
  root: 'choice',
  elements: {
    choice: {
      type: 'Choice',
      props: {
        label: 'Which itinerary pace works best for you?',
        options: [
          {
            id: 'relaxed',
            label: 'Relaxed',
            description: '2-3 stops per day, plenty of downtime.',
          },
          {
            id: 'balanced',
            label: 'Balanced',
            description: '4-5 stops per day, a mix of sights and rest.',
          },
          {
            id: 'packed',
            label: 'Packed',
            description: '6+ stops per day, early starts and late finishes.',
          },
        ],
        // Interactive — the selection is ephemeral in this preview, not persisted.
        statePath: '/decisions/itinerary-pace',
      },
      children: [],
    },
  },
};

function CatalogChoiceDemo() {
  return <Playground controls={{}} layout="block" render={() => <SpecView spec={spec} />} />;
}

export const catalogChoiceDemo: LibraryDemo = {
  slug: 'catalog-choice',
  title: 'Choice',
  description: 'Single-select question the owner answers in the browser; the pick persists.',
  group: 'Catalog',
  render: () => <CatalogChoiceDemo />,
};
