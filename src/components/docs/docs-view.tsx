import { Link } from '@tanstack/react-router';

import { CopyButton } from '@/components/blocks/copy-button';
import { Table } from '@/components/ui/table';
import type { McpToolName } from '@/lib/mcp/tool-names';
import { MCP_TOOL_NAMES } from '@/lib/mcp/tool-names';

/**
 * Human-facing summaries of the MCP surface, deliberately not the LLM-facing description strings.
 * Three copies describe the tools: this table, the tool descriptions in `server.ts`, and the tool
 * table in `README.md`. Update all three when a tool changes. Exhaustive over `MCP_TOOL_NAMES`, so a
 * tool added or removed in `server.ts` fails typecheck here until this table follows.
 */
const MCP_TOOLS: Record<McpToolName, string> = {
  publish_spec:
    'Publishes a new artifact composed from the component catalog. Claude prefers this format for guides, comparisons, itineraries, and checklists.',
  publish_html:
    'Publishes a standalone HTML document for content the catalog can’t express. The document renders sandboxed on its own page.',
  publish_markdown:
    'Publishes a markdown document for prose-first content, rendered in the gallery. Catalog components can be embedded inline.',
  get_catalog: 'Returns the component vocabulary and example specs Claude authors specs against.',
  update_artifact:
    'Revises an existing artifact: appends a body version or edits metadata in place.',
  restore_version:
    'Brings an earlier version back as the current one by copying it forward. Nothing is overwritten.',
  list_artifacts:
    'Browses published artifacts with search, tag filters, type filters, and sorting.',
  list_tags: 'Lists the tags already in use so new artifacts reuse them.',
  manage_tags:
    'Renames a tag across every artifact or deletes it, to tidy up near-duplicates. A rename into an existing tag merges the two.',
  get_artifact: 'Fetches an artifact’s metadata, body, and your saved interaction state.',
  set_artifact_archived:
    'Archives an artifact out of Claude’s default listing, or restores it. Nothing is deleted.',
  delete_artifact: 'Soft-deletes an artifact and all of its versions.',
};

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex max-w-2xl items-center justify-between gap-2 rounded-lg border">
      <code className="overflow-x-auto px-3 py-2 font-mono text-sm whitespace-nowrap">{value}</code>
      <CopyButton className="m-1 shrink-0" label={label} text={value} />
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
        <h1 className="text-3xl font-semibold tracking-tight">Connect Claude to your gallery</h1>
        <p className="text-foreground-muted">
          Exhibit is a gallery Claude publishes to over MCP. Connect it once, then ask Claude to
          publish: artifacts show up here, rendered and versioned.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <SectionHeading>Add the connector</SectionHeading>
        <ol className="text-foreground-muted flex list-decimal flex-col gap-1 pl-5 leading-relaxed">
          <li>
            Open{' '}
            <strong className="text-foreground font-medium">
              Settings → Connectors → Add custom connector
            </strong>{' '}
            in the claude.ai web, desktop, or mobile app.
          </li>
          <li>Paste the server URL.</li>
          <li>Complete the sign-in and consent prompts as the gallery owner.</li>
        </ol>
        <p className="text-foreground-muted leading-relaxed">
          Connectors require the gallery to be served over HTTPS.
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
          There is nothing to operate: Claude picks the right tool from the conversation. You can
          make requests such as these:
        </p>
        <ul className="text-foreground-muted flex list-disc flex-col gap-1 pl-5 leading-relaxed">
          <li>Publish a comparison of the apartments we discussed.</li>
          <li>Turn this conversation into a step-by-step guide.</li>
          <li>Update the Tokyo itinerary with a day trip.</li>
          <li>Tell me what I checked off on the packing list you published.</li>
        </ul>
        <Table.Viewport>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Tool</Table.Head>
                <Table.Head>What it does</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {MCP_TOOL_NAMES.map((name) => (
                <Table.Row key={name}>
                  <Table.Cell className="align-top">
                    <code className="font-mono text-xs">{name}</code>
                  </Table.Cell>
                  <Table.Cell className="text-foreground-muted whitespace-normal">
                    {MCP_TOOLS[name]}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Table.Viewport>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading>Manage connections</SectionHeading>
        <p className="text-foreground-muted leading-relaxed">
          Every client that authorized against this gallery is listed in{' '}
          <Link className="text-foreground underline underline-offset-4" to="/settings">
            Settings
          </Link>{' '}
          under MCP connections. Revoking deletes the client’s registration and tokens, so its
          access ends immediately, even for tokens it already holds. The client can reconnect later
          by authorizing again.
        </p>
      </section>
    </div>
  );
}
