import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

function CardDemo() {
  return (
    <Playground
      controls={{
        title: { kind: 'text', label: 'Title', defaultValue: 'Card title' },
        description: { kind: 'text', label: 'Description', defaultValue: 'A short description.' },
        footer: { kind: 'boolean', label: 'Footer', defaultValue: true },
      }}
      render={(values) => (
        <Card.Root className="w-64">
          <Card.Header>
            <Card.Title>{values.title}</Card.Title>
            <Card.Description>{values.description}</Card.Description>
          </Card.Header>
          <Card.Content>
            <p className="text-foreground-muted text-sm">Body content goes here.</p>
          </Card.Content>
          {values.footer && (
            <Card.Footer>
              <Button>Action</Button>
            </Card.Footer>
          )}
        </Card.Root>
      )}
    />
  );
}

export const cardDemo: LibraryDemo = {
  slug: 'card',
  title: 'Card',
  description: 'A bordered container for grouping related header, body, and action content.',
  group: 'Components',
  render: () => <CardDemo />,
};
