import { kitchenSinkFixture } from '@/catalog/fixtures/kitchen-sink';
import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';

export const kitchenSinkDemo: LibraryDemo = {
  slug: 'kitchen-sink',
  title: 'Kitchen sink',
  description:
    'Everything composed into one artifact: the fixture that exercises every catalog component, rendered exactly as a published spec would be.',
  group: 'Examples',
  render: () => <SpecView spec={kitchenSinkFixture} />,
};
