import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

function CatalogNoteBoxDemo() {
  return (
    <Playground
      controls={{
        label: { kind: 'text', label: 'Label', defaultValue: 'Anything to change?' },
        placeholder: {
          kind: 'text',
          label: 'Placeholder',
          defaultValue: 'e.g. swap the Friday hike for a rest day',
        },
      }}
      layout="block"
      render={(values) => {
        const spec: Spec = {
          root: 'note-box',
          elements: {
            'note-box': {
              type: 'NoteBox',
              props: {
                label: values.label,
                placeholder: values.placeholder,
                // Interactive — the text is ephemeral in this preview, not persisted.
                statePath: '/feedback/itinerary',
              },
              children: [],
            },
          },
        };

        return <SpecView spec={spec} />;
      }}
    />
  );
}

export const catalogNoteBoxDemo: LibraryDemo = {
  slug: 'catalog-note-box',
  title: 'Note box',
  description: 'Free-form text box the owner can type into; the text persists at a statePath.',
  group: 'Catalog',
  render: () => <CatalogNoteBoxDemo />,
};
