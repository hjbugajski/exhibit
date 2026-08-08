import { catalogDemo } from '@/components/library/catalog-demo';

export const catalogChoiceDemo = catalogDemo({
  slug: 'catalog-choice',
  title: 'Choice',
  description: 'Single-select question the owner answers in the browser; the pick persists.',
  element: {
    type: 'Choice',
    props: {
      label: 'Which itinerary pace works best for you?',
      options: [
        { id: 'relaxed', label: 'Relaxed', description: '2-3 stops per day, plenty of downtime.' },
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
  },
});
