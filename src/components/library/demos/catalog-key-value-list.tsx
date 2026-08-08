import { catalogDemo } from '@/components/library/catalog-demo';

const columnOptions = ['1', '2'] as const;

export const catalogKeyValueListDemo = catalogDemo({
  slug: 'catalog-key-value-list',
  title: 'Key-value list',
  description: 'Compact list of label/value pairs, like a spec sheet.',
  controls: {
    columns: { kind: 'select', label: 'Columns', options: columnOptions, defaultValue: '1' },
  },
  element: (values) => ({
    type: 'KeyValueList',
    props: {
      columns: Number(values.columns),
      items: [
        { id: 'checkin', key: 'Check-in', value: 'May 3, 2026' },
        { id: 'checkout', key: 'Check-out', value: 'May 8, 2026' },
        { id: 'guests', key: 'Guests', value: '2 adults' },
        { id: 'room', key: 'Room type', value: 'Deluxe king' },
        { id: 'rate', key: 'Nightly rate', value: '$180' },
        { id: 'total', key: 'Total', value: '$900' },
      ],
    },
  }),
});
