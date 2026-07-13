import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Table } from '@/components/ui/table';

function TableDemo() {
  return (
    <Playground
      controls={{
        footer: { kind: 'boolean', label: 'Footer', defaultValue: false },
      }}
      layout="block"
      render={(values) => (
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Name</Table.Head>
              <Table.Head>Type</Table.Head>
              <Table.Head>Status</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell>itinerary.json</Table.Cell>
              <Table.Cell>Spec</Table.Cell>
              <Table.Cell>Published</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell>report.html</Table.Cell>
              <Table.Cell>HTML</Table.Cell>
              <Table.Cell>Draft</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell>comparison.json</Table.Cell>
              <Table.Cell>Spec</Table.Cell>
              <Table.Cell>Published</Table.Cell>
            </Table.Row>
          </Table.Body>
          {values.footer && (
            <Table.Footer>
              <Table.Row>
                <Table.Cell colSpan={2}>Total</Table.Cell>
                <Table.Cell>3 artifacts</Table.Cell>
              </Table.Row>
            </Table.Footer>
          )}
        </Table.Root>
      )}
    />
  );
}

export const tableDemo: LibraryDemo = {
  slug: 'table',
  title: 'Table',
  description: 'Tabular data display with header, body, and optional footer.',
  group: 'Components',
  render: () => <TableDemo />,
};
