import { catalogDemo } from '@/components/library/catalog-demo';

const trends = ['up', 'down', 'flat'] as const;

export const catalogCardDemo = catalogDemo({
  slug: 'catalog-card',
  title: 'Card',
  description:
    'Bordered container for a self-contained chunk of content; set a value for a key metric.',
  controls: {
    title: { kind: 'text', label: 'Title', defaultValue: 'Pro' },
    subtitle: { kind: 'text', label: 'Subtitle', defaultValue: 'Best value' },
    badge: { kind: 'text', label: 'Badge', defaultValue: '$12/mo' },
    value: { kind: 'text', label: 'Value', defaultValue: '' },
    delta: { kind: 'text', label: 'Delta', defaultValue: '' },
    trend: { kind: 'select', label: 'Trend', options: trends, defaultValue: 'flat' },
  },
  root: 'card',
  elements: (values) => ({
    card: {
      type: 'Card',
      props: {
        title: values.title,
        subtitle: values.subtitle,
        badge: values.badge,
        ...(values.value
          ? { value: values.value, delta: values.delta || undefined, trend: values.trend }
          : {}),
      },
      children: ['prose'],
    },
    prose: {
      type: 'Prose',
      props: { markdown: 'Unlimited projects, **200 GB** storage, and priority support.' },
    },
  }),
});
