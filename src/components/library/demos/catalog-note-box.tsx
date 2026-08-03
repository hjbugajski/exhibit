import { catalogDemo } from '@/components/library/catalog-demo';

export const catalogNoteBoxDemo = catalogDemo({
  slug: 'catalog-note-box',
  title: 'Note box',
  description: 'Free-form text box the owner can type into; the text persists at a statePath.',
  controls: {
    label: { kind: 'text', label: 'Label', defaultValue: 'Anything to change?' },
    placeholder: {
      kind: 'text',
      label: 'Placeholder',
      defaultValue: 'e.g. swap the Friday hike for a rest day',
    },
  },
  element: (values) => ({
    type: 'NoteBox',
    props: {
      label: values.label,
      placeholder: values.placeholder,
      // Interactive — the text is ephemeral in this preview, not persisted.
      statePath: '/feedback/itinerary',
    },
  }),
});
