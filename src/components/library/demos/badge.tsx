import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Badge } from '@/components/ui/badge';

const variants = ['default', 'outline', 'info', 'success', 'warning', 'danger'] as const;

function BadgeDemo() {
  return (
    <Playground
      controls={{
        variant: { kind: 'select', label: 'Variant', options: variants, defaultValue: 'default' },
        label: { kind: 'text', label: 'Label', defaultValue: 'Badge' },
      }}
      render={(values) => <Badge variant={values.variant}>{values.label}</Badge>}
    />
  );
}

export const badgeDemo: LibraryDemo = {
  slug: 'badge',
  title: 'Badge',
  description: 'A compact label for status, count, or metadata, inline or standalone.',
  group: 'Components',
  render: () => <BadgeDemo />,
};
