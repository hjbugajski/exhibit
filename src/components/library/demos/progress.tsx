import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Progress } from '@/components/ui/progress';

const presetValues = ['indeterminate', '0', '25', '50', '75', '100'] as const;

function ProgressDemo() {
  return (
    <Playground
      controls={{
        value: { kind: 'select', label: 'Value', options: presetValues, defaultValue: '50' },
      }}
      render={(values) => (
        <Progress.Root
          className="max-w-sm"
          value={values.value === 'indeterminate' ? null : Number(values.value)}
        >
          <div className="flex w-full justify-between">
            <Progress.Label>Uploading</Progress.Label>
            <Progress.Value />
          </div>
        </Progress.Root>
      )}
    />
  );
}

export const progressDemo: LibraryDemo = {
  slug: 'progress',
  title: 'Progress',
  description: 'Determinate progress bar with an optional label and value overlay.',
  group: 'Components',
  render: () => <ProgressDemo />,
};
