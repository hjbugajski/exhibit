import { catalogDemo } from '@/components/library/catalog-demo';

export const catalogTabsDemo = catalogDemo({
  slug: 'catalog-tabs',
  title: 'Tabs',
  description: 'Tabbed container with one label per child; use for alternate views of a topic.',
  root: 'tabs',
  elements: {
    tabs: {
      type: 'Tabs',
      props: { items: ['Studio', 'One-bedroom', 'Two-bedroom'] },
      children: ['studio', 'one-bed', 'two-bed'],
    },
    studio: {
      type: 'KeyValueList',
      props: {
        items: [
          { id: 'rent', key: 'Rent', value: '$1,450/mo' },
          { id: 'sqft', key: 'Size', value: '480 sq ft' },
        ],
      },
    },
    'one-bed': {
      type: 'KeyValueList',
      props: {
        items: [
          { id: 'rent', key: 'Rent', value: '$1,850/mo' },
          { id: 'sqft', key: 'Size', value: '720 sq ft' },
        ],
      },
    },
    'two-bed': {
      type: 'KeyValueList',
      props: {
        items: [
          { id: 'rent', key: 'Rent', value: '$2,400/mo' },
          { id: 'sqft', key: 'Size', value: '1,050 sq ft' },
        ],
      },
    },
  },
});
