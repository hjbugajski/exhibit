import { Plus } from 'lucide-react';

import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

const variants = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;

function ButtonDemo() {
  return (
    <Playground
      controls={{
        variant: { kind: 'select', label: 'Variant', options: variants, defaultValue: 'default' },
        iconOnly: { kind: 'boolean', label: 'Icon only', defaultValue: false },
        disabled: { kind: 'boolean', label: 'Disabled', defaultValue: false },
        loading: { kind: 'boolean', label: 'Loading', defaultValue: false },
        label: { kind: 'text', label: 'Label', defaultValue: 'Button' },
      }}
      render={(values) =>
        values.iconOnly ? (
          <Button
            aria-label={values.label}
            disabled={values.disabled || values.loading}
            variant={values.variant}
          >
            {values.loading ? <Spinner data-icon="only" /> : <Plus data-icon="only" />}
          </Button>
        ) : (
          <Button disabled={values.disabled || values.loading} variant={values.variant}>
            {values.loading ? <Spinner data-icon="inline-start" /> : null}
            {values.label}
          </Button>
        )
      }
    />
  );
}

export const buttonDemo: LibraryDemo = {
  slug: 'button',
  title: 'Button',
  description:
    'The action control. One 32px size; an icon tagged data-icon="only" makes it a square.',
  group: 'Components',
  render: () => <ButtonDemo />,
};
