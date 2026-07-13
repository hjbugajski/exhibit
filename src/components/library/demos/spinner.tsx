import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

function SpinnerDemo() {
  return (
    <Playground
      controls={{}}
      render={() => (
        <div className="flex flex-col items-center gap-4">
          <Spinner />
          <Button disabled>
            <Spinner data-icon="inline-start" />
            Loading
          </Button>
        </div>
      )}
    />
  );
}

export const spinnerDemo: LibraryDemo = {
  slug: 'spinner',
  title: 'Spinner',
  description: 'Indeterminate loading indicator, standalone or inside a pending button.',
  group: 'Components',
  render: () => <SpinnerDemo />,
};
