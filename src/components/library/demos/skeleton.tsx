import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function SkeletonDemo() {
  return (
    <Playground
      controls={{}}
      render={() => (
        <Card.Root className="w-64">
          <Card.Header>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
          </Card.Header>
          <Card.Content className="flex flex-col gap-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </Card.Content>
        </Card.Root>
      )}
    />
  );
}

export const skeletonDemo: LibraryDemo = {
  slug: 'skeleton',
  title: 'Skeleton',
  description: 'Pulsing placeholder for content that has not finished loading.',
  group: 'Components',
  render: () => <SkeletonDemo />,
};
