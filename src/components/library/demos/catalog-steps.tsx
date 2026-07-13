import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

const spec: Spec = {
  root: 'steps',
  elements: {
    steps: {
      type: 'Steps',
      props: {
        items: [
          {
            id: 'create-account',
            title: 'Create an account',
            markdown: 'Sign up with an email address — no credit card required.',
          },
          {
            id: 'connect-domain',
            title: 'Connect your domain',
            markdown: 'Add a `CNAME` record pointing to `app.exhibit.dev`.',
          },
          {
            id: 'invite-team',
            title: 'Invite your team',
            markdown: 'Up to five seats on the free plan.',
          },
          { id: 'go-live', title: 'Go live' },
        ],
      },
      children: [],
    },
  },
};

function CatalogStepsDemo() {
  return <Playground controls={{}} layout="block" render={() => <SpecView spec={spec} />} />;
}

export const catalogStepsDemo: LibraryDemo = {
  slug: 'catalog-steps',
  title: 'Steps',
  description: 'Ordered, numbered sequence of instructions the reader should follow in order.',
  group: 'Catalog',
  render: () => <CatalogStepsDemo />,
};
