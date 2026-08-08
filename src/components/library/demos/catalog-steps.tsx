import { catalogDemo } from '@/components/library/catalog-demo';

export const catalogStepsDemo = catalogDemo({
  slug: 'catalog-steps',
  title: 'Steps',
  description: 'Ordered, numbered sequence of instructions the reader should follow in order.',
  element: {
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
  },
});
