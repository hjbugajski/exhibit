import { flowFixture } from '@/catalog/fixtures/flow';
import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';

export const flowDemo: LibraryDemo = {
  slug: 'flow',
  title: 'Flow stress test',
  description:
    'Blocks first, last, and adjacent in every rhythm-sensitive combination — the fixture for tuning the prose-flow margin scale.',
  group: 'Examples',
  render: () => <SpecView spec={flowFixture} />,
};
