import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Separator } from '@/components/ui/separator';

const orientations = ['horizontal', 'vertical'] as const;

function SeparatorDemo() {
  return (
    <Playground
      controls={{
        orientation: {
          kind: 'select',
          label: 'Orientation',
          options: orientations,
          defaultValue: 'horizontal',
        },
      }}
      render={(values) =>
        values.orientation === 'horizontal' ? (
          <div className="flex w-full max-w-xs flex-col gap-3">
            <p className="text-sm">Above</p>
            <Separator orientation={values.orientation} />
            <p className="text-sm">Below</p>
          </div>
        ) : (
          <div className="flex h-8 items-center gap-3">
            <span className="text-sm">Left</span>
            <Separator orientation={values.orientation} />
            <span className="text-sm">Right</span>
          </div>
        )
      }
    />
  );
}

export const separatorDemo: LibraryDemo = {
  slug: 'separator',
  title: 'Separator',
  description: 'Visual divider between content groups, horizontal or vertical.',
  group: 'Components',
  render: () => <SeparatorDemo />,
};
