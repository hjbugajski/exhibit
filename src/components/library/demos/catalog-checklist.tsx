import { catalogDemo } from '@/components/library/catalog-demo';

export const catalogChecklistDemo = catalogDemo({
  slug: 'catalog-checklist',
  title: 'Checklist',
  description: 'Checklist of items; items with a statePath are interactive and persist state.',
  element: {
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
  },
});
