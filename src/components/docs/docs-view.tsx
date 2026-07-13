import { Link } from '@tanstack/react-router';
import { Check, Copy, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Table } from '@/components/ui/table';
import { useCopyToClipboard } from '@/lib/use-copy-to-clipboard';

/**
 * Human-facing summaries of the MCP surface, kept in the registration order of
 * `src/lib/mcp/server.ts`. Deliberately not the LLM-facing description strings — update both when
 * a tool changes.
 */
const MCP_TOOLS = [
  {
    name: 'publish_spec',
    purpose:
      'Publishes a new artifact composed from the component catalog — the format Claude prefers for guides, comparisons, itineraries, and checklists.',
  },
  {
    name: 'publish_html',
    purpose:
      'Publishes a standalone HTML document for content the catalog can’t express. Rendered sandboxed on its own page.',
  },
  {
    name: 'get_catalog',
    purpose: 'Returns the component vocabulary and example specs Claude authors specs against.',
  },
  {
    name: 'update_artifact',
    purpose: 'Revises an existing artifact — appends body versions or edits metadata in place.',
  },
  {
    name: 'list_artifacts',
    purpose: 'Browses published artifacts with search, tag and type filters, and sorting.',
  },
  {
    name: 'list_tags',
    purpose: 'Lists the tags already in use so new artifacts reuse them.',
  },
  {
    name: 'get_artifact',
    purpose: 'Fetches an artifact’s metadata, body, and your saved interaction state.',
  },
  {
    name: 'delete_artifact',
    purpose: 'Soft-deletes an artifact and all of its versions.',
  },
];

function CopyField({ label, value }: { label: string; value: string }) {
  const { copyStatus, copy } = useCopyToClipboard();

  return (
    <div className="flex max-w-2xl items-center justify-between gap-2 rounded-lg border">
      <code className="overflow-x-auto px-3 py-2 font-mono text-sm whitespace-nowrap">{value}</code>
      <Button
        aria-label={label}
        className="m-1 shrink-0"
        onClick={() => {
          void copy(value);
        }}
        variant="ghost"
      >
        {copyStatus === 'copied' ? (
          <Check data-icon="only" />
        ) : copyStatus === 'failed' ? (
          <X data-icon="only" />
        ) : (
          <Copy data-icon="only" />
        )}
      </Button>
    </div>
  );
}

function SectionHeading({ children }: { children: string }) {
  return <h2 className="text-xl font-semibold tracking-tight">{children}</h2>;
}

export function DocsView({ mcpUrl }: { mcpUrl: string }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Docs</h1>
        <p className="text-foreground-muted">
          Exhibit is a gallery Claude publishes to over MCP. Connect it once, then ask Claude to
          publish — artifacts show up here, rendered and versioned.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <SectionHeading>Connect Claude</SectionHeading>
        <p className="text-foreground-muted leading-relaxed">
          In the claude.ai web, desktop, or mobile apps, open Settings → Connectors → Add custom
          connector and paste the server URL, then complete the sign-in and consent prompts as the
          gallery owner. Connectors require the gallery to be served over HTTPS.
        </p>
        <CopyField label="Copy server URL" value={mcpUrl} />
        <p className="text-foreground-muted leading-relaxed">
          For Claude Code, register the server once in a terminal, then authenticate with{' '}
          <code className="font-mono text-sm">/mcp</code> inside a session.
        </p>
        <CopyField
          label="Copy Claude Code command"
          value={`claude mcp add --transport http exhibit ${mcpUrl}`}
        />
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>What Claude can do</SectionHeading>
        <p className="text-foreground-muted leading-relaxed">
          There is nothing to operate — Claude picks the right tool from the conversation. Ask it to
          publish a comparison of the apartments you discussed, to turn a conversation into a
          step-by-step guide, to update the Tokyo itinerary with a day trip, or what you checked off
          on the packing list it published.
        </p>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Tool</Table.Head>
              <Table.Head>What it does</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {MCP_TOOLS.map((tool) => (
              <Table.Row key={tool.name}>
                <Table.Cell className="align-top">
                  <code className="font-mono text-xs">{tool.name}</code>
                </Table.Cell>
                <Table.Cell className="text-foreground-muted whitespace-normal">
                  {tool.purpose}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>Manage connections</SectionHeading>
        <p className="text-foreground-muted leading-relaxed">
          Every client that authorized against this gallery is listed in{' '}
          <Link className="text-foreground underline underline-offset-4" to="/settings">
            Settings
          </Link>{' '}
          under MCP connections. Revoking removes the client’s registration and tokens; it can
          reconnect later by authorizing again.
        </p>
      </section>
    </div>
  );
}
