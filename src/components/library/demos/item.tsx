import { FileIcon } from 'lucide-react';

import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Button } from '@/components/ui/button';
import { Item } from '@/components/ui/item';

const variants = ['default', 'outline', 'muted'] as const;
const mediaVariants = ['default', 'icon', 'image'] as const;

function ItemDemo() {
  return (
    <Playground
      controls={{
        variant: { kind: 'select', label: 'Variant', options: variants, defaultValue: 'outline' },
        media: { kind: 'select', label: 'Media', options: mediaVariants, defaultValue: 'icon' },
        description: { kind: 'boolean', label: 'Description', defaultValue: true },
        actions: { kind: 'boolean', label: 'Actions', defaultValue: true },
      }}
      layout="block"
      render={(values) => (
        <Item.Group className="w-72">
          <Item.Root variant={values.variant}>
            <Item.Media variant={values.media}>
              {values.media === 'image' ? (
                <div className="bg-surface-muted size-full" />
              ) : (
                <FileIcon />
              )}
            </Item.Media>
            <Item.Content>
              <Item.Title>itinerary.json</Item.Title>
              {values.description && <Item.Description>Published 2 days ago</Item.Description>}
            </Item.Content>
            {values.actions && (
              <Item.Actions>
                <Button variant="ghost">View</Button>
              </Item.Actions>
            )}
          </Item.Root>
          <Item.Separator />
          <Item.Root variant="muted">
            <Item.Media variant="icon">
              <FileIcon />
            </Item.Media>
            <Item.Content>
              <Item.Title>report.html</Item.Title>
              <Item.Description>Draft</Item.Description>
            </Item.Content>
          </Item.Root>
        </Item.Group>
      )}
    />
  );
}

export const itemDemo: LibraryDemo = {
  slug: 'item',
  title: 'Item',
  description: 'A row layout for media, title, description, and actions in lists.',
  group: 'Components',
  render: () => <ItemDemo />,
};
