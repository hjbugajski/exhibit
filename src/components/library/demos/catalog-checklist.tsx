import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const spec: Spec = {
  root: 'checklist',
  elements: {
    checklist: {
      type: 'Checklist',
      props: {
        items: [
          { id: 'passport', text: 'Passport valid 6+ months', checked: true },
          { id: 'visa', text: 'Visa on arrival confirmed', checked: true },
          // Interactive items — toggled state is ephemeral in this preview, not persisted.
          { id: 'book-hotel', text: 'Book hotel', statePath: '/tasks/book-hotel' },
          {
            id: 'exchange-currency',
            text: 'Exchange currency',
            statePath: '/tasks/exchange-currency',
          },
          { id: 'pack-adapter', text: 'Pack a plug adapter', statePath: '/tasks/pack-adapter' },
        ],
      },
      children: [],
    },
  },
};

function CatalogChecklistDemo() {
  return <Playground controls={{}} layout="block" render={() => <SpecView spec={spec} />} />;
}

export const catalogChecklistDemo: LibraryDemo = {
  slug: 'catalog-checklist',
  title: 'Checklist',
  description: 'Checklist of items; items with a statePath are interactive and persist state.',
  group: 'Catalog',
  render: () => <CatalogChecklistDemo />,
};
