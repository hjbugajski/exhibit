import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';
import { Table as UiTable } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Table'>;

const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

/** Same render-time guard as markdown links (markdown-body.tsx): non-http(s) hrefs degrade to text. */
const HTTP_URL = /^https?:\/\//i;

function CellValue({ value }: { value: Props['rows'][number][string] | undefined }) {
  if (value === undefined || typeof value === 'string') {
    return value ?? '';
  }

  if (!HTTP_URL.test(value.href)) {
    return value.text;
  }

  return (
    <a
      className="text-accent underline underline-offset-4"
      href={value.href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {value.text}
    </a>
  );
}

export function Table({ props }: { props: Props }) {
  return (
    // UiTable.Root's className lands on the inner <table>, so the flow margin needs its own
    // wrapper around the scroll container.
    <div className={flowBlock}>
      <UiTable.Root>
        <UiTable.Header>
          <UiTable.Row>
            {props.columns.map((column) => (
              <UiTable.Head className={cn(alignClass[column.align ?? 'left'])} key={column.key}>
                {column.label}
              </UiTable.Head>
            ))}
          </UiTable.Row>
        </UiTable.Header>
        <UiTable.Body>
          {props.rows.map((row, index) => (
            <UiTable.Row key={index}>
              {props.columns.map((column) => (
                <UiTable.Cell className={cn(alignClass[column.align ?? 'left'])} key={column.key}>
                  <CellValue value={row[column.key]} />
                </UiTable.Cell>
              ))}
            </UiTable.Row>
          ))}
        </UiTable.Body>
      </UiTable.Root>
    </div>
  );
}
