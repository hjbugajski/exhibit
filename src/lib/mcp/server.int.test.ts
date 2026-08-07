import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { comparisonFixture } from '@/catalog/fixtures/comparison';
import { itineraryFixture } from '@/catalog/fixtures/itinerary';
import type { Db } from '@/database/repository';
import { setArtifactArchived, setArtifactState } from '@/database/repository';
import { buildMcpServer } from '@/lib/mcp/server';
import { MCP_TOOL_NAMES } from '@/lib/mcp/tool-names';
import { createTestDb } from '@testing/db';
import { invalidFixture } from '@testing/fixtures/invalid';

let sqlite: Database.Database;

async function connectClient(db: Db): Promise<Client> {
  const server = buildMcpServer(db);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return client;
}

interface CallToolResult {
  isError?: boolean;
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
}

async function callTool(
  client: Client,
  name: string,
  args?: Record<string, unknown>,
): Promise<CallToolResult> {
  return client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
}

function textOf(result: CallToolResult): string {
  return result.content.map((c) => c.text ?? '').join('\n');
}

/**
 * The read tools' text-block contract: one summary line, then the payload as JSON. Clients that
 * drop `structuredContent` see only this, so the tests assert against it directly.
 */
function jsonOf(result: CallToolResult): Record<string, unknown> {
  const body = textOf(result);

  return JSON.parse(body.slice(body.indexOf('\n') + 1)) as Record<string, unknown>;
}

let db: Db;
let client: Client;

beforeEach(async () => {
  ({ db, sqlite } = createTestDb());
  client = await connectClient(db);
});

afterEach(() => {
  sqlite.close();
});

describe('tools/list', () => {
  it('registers exactly the declared tool names', async () => {
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());
  });
});

describe('publish_spec', () => {
  it('publishes a valid spec as version 1', async () => {
    const result = await callTool(client, 'publish_spec', {
      title: 'Kyoto Trip',
      tags: ['travel'],
      spec: itineraryFixture,
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ version: 1 });
    const id = result.structuredContent?.id as string;
    expect(id).toBeTruthy();
    expect(result.structuredContent?.url).toBe(`http://localhost:3000/a/${id}`);
    // The url must be in the text too — most MCP clients only surface text content.
    expect(textOf(result)).toContain(`http://localhost:3000/a/${id}`);

    const getResult = await callTool(client, 'get_artifact', { id });
    expect(getResult.structuredContent?.title).toBe('Kyoto Trip');
    expect(getResult.structuredContent?.type).toBe('spec');
  });

  it('rejects the invalid fixture with a structured error list', async () => {
    const result = await callTool(client, 'publish_spec', {
      title: 'Broken',
      spec: invalidFixture,
    });

    expect(result.isError).toBe(true);
    const errors = result.structuredContent?.errors as {
      element: unknown;
      path: string;
      message: string;
    }[];
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      expect(error).toHaveProperty('element');
      expect(error).toHaveProperty('component');
      expect(error).toHaveProperty('path');
      expect(error).toHaveProperty('message');
    }
  });

  it('rejects a spec payload over the 1 MB cap', async () => {
    const spec = {
      root: 'root',
      elements: {
        root: { type: 'Prose', props: { markdown: 'x'.repeat(1_100_000) }, children: [] },
      },
    };

    const result = await callTool(client, 'publish_spec', { title: 'Huge', spec });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('1 MB');
  });
});

describe('publish_html', () => {
  it('round trips a complete HTML document', async () => {
    const html = '<html><head><title>t</title></head><body>hi</body></html>';
    const result = await callTool(client, 'publish_html', { title: 'Page', html });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ version: 1 });

    const id = result.structuredContent?.id as string;
    expect(textOf(result)).toContain(`http://localhost:3000/a/${id}`);
    const getResult = await callTool(client, 'get_artifact', { id });
    expect(getResult.structuredContent?.body).toBe(html);
    expect(getResult.structuredContent?.type).toBe('html');
  });

  it('rejects html missing an <html> tag as a lenient sanity check', async () => {
    const result = await callTool(client, 'publish_html', {
      title: 'Not HTML',
      html: '<div>hi</div>',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('<html>');
  });

  it('rejects an html payload over the 1 MB cap', async () => {
    const html = `<html>${'x'.repeat(1_100_000)}</html>`;

    const result = await callTool(client, 'publish_html', { title: 'Huge', html });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('1 MB');
  });
});

describe('publish_markdown', () => {
  it('round trips a markdown body byte for byte', async () => {
    // Trailing newline, CRLF, tabs and a directive: nothing may be normalized on the way through.
    const markdown = '# Title\r\n\n\t- [x] done\n\n<!-- ::Divider -->\n\nBody.\n';
    const result = await callTool(client, 'publish_markdown', { title: 'Notes', markdown });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ version: 1 });

    const id = result.structuredContent?.id as string;
    expect(textOf(result)).toContain(`http://localhost:3000/a/${id}`);

    const getResult = await callTool(client, 'get_artifact', { id });
    expect(getResult.structuredContent?.body).toBe(markdown);
    expect(getResult.structuredContent?.type).toBe('markdown');
  });

  // Markdown is arbitrary prose: unlike spec and html bodies there is nothing to validate beyond
  // its size, and content that looks like an attack must still store verbatim (it is escaped at
  // render time, not on the way in).
  it('stores markdown containing raw HTML without rejecting or rewriting it', async () => {
    const markdown = '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n';
    const result = await callTool(client, 'publish_markdown', { title: 'Hostile', markdown });

    expect(result.isError).toBeFalsy();

    const getResult = await callTool(client, 'get_artifact', {
      id: result.structuredContent?.id as string,
    });
    expect(getResult.structuredContent?.body).toBe(markdown);
  });

  it('rejects a markdown payload over the 1 MB cap', async () => {
    const result = await callTool(client, 'publish_markdown', {
      title: 'Huge',
      markdown: 'x'.repeat(1_100_000),
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('1 MB');
  });
});

describe('get_catalog', () => {
  it('returns catalog text and structured content under budget', async () => {
    const result = await callTool(client, 'get_catalog');

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('WIRE FORMAT');
    expect(textOf(result).length / 4).toBeLessThan(4000);
    expect(result.structuredContent).toHaveProperty('components');
  });
});

describe('update_artifact', () => {
  it('appends a new version when a body is provided', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    const updated = await callTool(client, 'update_artifact', { id, spec: comparisonFixture });

    expect(updated.isError).toBeFalsy();
    expect(updated.structuredContent).toMatchObject({ id, version: 2 });
    expect(textOf(updated)).toContain(`http://localhost:3000/a/${id}`);
  });

  it('updates metadata in place without creating a new version', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    const updated = await callTool(client, 'update_artifact', { id, title: 'Renamed' });

    expect(updated.isError).toBeFalsy();
    expect(updated.structuredContent).toMatchObject({ id, version: 1 });

    const getResult = await callTool(client, 'get_artifact', { id });
    expect(getResult.structuredContent?.title).toBe('Renamed');
  });

  it('rejects a type-mismatched body update', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    const updated = await callTool(client, 'update_artifact', { id, html: '<html></html>' });

    expect(updated.isError).toBe(true);
    expect(textOf(updated)).toContain('spec');
  });

  it('appends a markdown version to a markdown artifact', async () => {
    const published = await callTool(client, 'publish_markdown', {
      title: 'Notes',
      markdown: '# v1',
    });
    const id = published.structuredContent?.id as string;

    const updated = await callTool(client, 'update_artifact', { id, markdown: '# v2' });

    expect(updated.isError).toBeFalsy();
    expect(updated.structuredContent).toMatchObject({ id, version: 2 });

    const getResult = await callTool(client, 'get_artifact', { id });
    expect(getResult.structuredContent?.body).toBe('# v2');
    expect(getResult.structuredContent?.versions).toEqual([1, 2]);
  });

  it('rejects a markdown body update against a spec artifact', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    const updated = await callTool(client, 'update_artifact', {
      id,
      markdown: '# nope',
    });

    expect(updated.isError).toBe(true);
    expect(textOf(updated)).toContain('a spec payload instead');
  });

  it('rejects more than one body payload in a single call', async () => {
    const published = await callTool(client, 'publish_markdown', {
      title: 'Notes',
      markdown: '# v1',
    });
    const id = published.structuredContent?.id as string;

    const updated = await callTool(client, 'update_artifact', {
      id,
      markdown: '# v2',
      html: '<html></html>',
    });

    expect(updated.isError).toBe(true);
    expect(textOf(updated)).toContain('at most one');

    // The rejected call must not have appended anything.
    const getResult = await callTool(client, 'get_artifact', { id });
    expect(getResult.structuredContent?.versions).toEqual([1]);
  });
});

describe('restore_version', () => {
  it('copies an older version forward as the new latest, byte for byte', async () => {
    const v1 = '# v1\n\nTrailing spaces  \nand a tab\there. Émoji: 🎏\n';
    const published = await callTool(client, 'publish_markdown', { title: 'Notes', markdown: v1 });
    const id = published.structuredContent?.id as string;

    await callTool(client, 'update_artifact', { id, markdown: '# v2' });

    const restored = await callTool(client, 'restore_version', { id, version: 1 });

    expect(restored.isError).toBeFalsy();
    expect(restored.structuredContent).toMatchObject({ id, version: 3 });
    expect(textOf(restored)).toContain(`http://localhost:3000/a/${id}`);

    const latest = await callTool(client, 'get_artifact', { id });
    expect(latest.structuredContent?.body).toBe(v1);
    // Append-only: the intermediate version is still readable.
    expect(latest.structuredContent?.versions).toEqual([1, 2, 3]);
    expect(jsonOf(await callTool(client, 'get_artifact', { id, version: 2 })).body).toBe('# v2');
  });

  it('leaves the owner’s interaction state untouched', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    setArtifactState(db, id, { 'packing/tickets': true });
    await callTool(client, 'update_artifact', { id, spec: comparisonFixture });
    await callTool(client, 'restore_version', { id, version: 1 });

    const latest = await callTool(client, 'get_artifact', { id });
    expect(latest.structuredContent?.state).toEqual({ 'packing/tickets': true });
  });

  it('reports a missing version distinctly from a missing artifact', async () => {
    const published = await callTool(client, 'publish_markdown', { title: 'Notes', markdown: '#' });
    const id = published.structuredContent?.id as string;

    const missingVersion = await callTool(client, 'restore_version', { id, version: 7 });
    expect(missingVersion.isError).toBe(true);
    expect(textOf(missingVersion)).toContain('no version 7');

    const missingArtifact = await callTool(client, 'restore_version', {
      id: 'does-not-exist',
      version: 1,
    });
    expect(missingArtifact.isError).toBe(true);
    expect(textOf(missingArtifact)).toContain('list_artifacts');

    // Neither failure may append anything.
    const latest = await callTool(client, 'get_artifact', { id });
    expect(latest.structuredContent?.versions).toEqual([1]);
  });
});

describe('list_artifacts', () => {
  it('filters and paginates', async () => {
    await callTool(client, 'publish_spec', {
      title: 'Alpha',
      tags: ['red'],
      spec: itineraryFixture,
    });
    await callTool(client, 'publish_html', { title: 'Beta', html: '<html>b</html>' });
    await callTool(client, 'publish_spec', {
      title: 'Gamma',
      tags: ['red'],
      spec: comparisonFixture,
    });

    const specsOnly = await callTool(client, 'list_artifacts', { type: 'spec' });
    const specsOnlyItems = specsOnly.structuredContent?.items as unknown[];
    expect(specsOnlyItems.length).toBe(2);

    const page1 = await callTool(client, 'list_artifacts', { limit: 2 });
    const items1 = page1.structuredContent?.items as { title: string }[];
    expect(items1).toHaveLength(2);
    expect(page1.structuredContent?.nextCursor).toBeTruthy();

    const page2 = await callTool(client, 'list_artifacts', {
      limit: 2,
      cursor: page1.structuredContent?.nextCursor as string,
    });
    const items2 = page2.structuredContent?.items as { title: string }[];
    expect(items2).toHaveLength(1);
  });

  it('sorts alphabetically by title when sort is title-asc', async () => {
    await callTool(client, 'publish_spec', { title: 'Gamma', spec: itineraryFixture });
    await callTool(client, 'publish_html', { title: 'Alpha', html: '<html>a</html>' });
    await callTool(client, 'publish_spec', { title: 'Beta', spec: comparisonFixture });

    const result = await callTool(client, 'list_artifacts', { sort: 'title-asc' });
    const items = result.structuredContent?.items as { title: string }[];

    expect(items.map((item) => item.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('OR-matches artifacts having any of multiple tags', async () => {
    await callTool(client, 'publish_spec', {
      title: 'Red one',
      tags: ['red'],
      spec: itineraryFixture,
    });
    await callTool(client, 'publish_html', {
      title: 'Blue one',
      tags: ['blue'],
      html: '<html>b</html>',
    });
    await callTool(client, 'publish_spec', {
      title: 'Green one',
      tags: ['green'],
      spec: comparisonFixture,
    });

    const result = await callTool(client, 'list_artifacts', { tags: ['red', 'blue'] });
    const items = result.structuredContent?.items as { title: string }[];

    expect(items.map((item) => item.title).sort()).toEqual(['Blue one', 'Red one']);
  });

  it('still filters by the legacy singular tag param', async () => {
    await callTool(client, 'publish_spec', {
      title: 'Red one',
      tags: ['red'],
      spec: itineraryFixture,
    });
    await callTool(client, 'publish_html', {
      title: 'Blue one',
      tags: ['blue'],
      html: '<html>b</html>',
    });

    const result = await callTool(client, 'list_artifacts', { tag: 'red' });
    const items = result.structuredContent?.items as { title: string }[];

    expect(items.map((item) => item.title)).toEqual(['Red one']);
  });

  it('excludes archived artifacts', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Shelved',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    await callTool(client, 'publish_html', { title: 'Live', html: '<html>a</html>' });
    setArtifactArchived(db, id, true);

    const result = await callTool(client, 'list_artifacts', {});
    const items = result.structuredContent?.items as { title: string }[];

    expect(items.map((item) => item.title)).toEqual(['Live']);
  });

  it('returns archived artifacts and only those when archived is true', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Shelved',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    await callTool(client, 'publish_html', { title: 'Live', html: '<html>a</html>' });
    setArtifactArchived(db, id, true);

    const result = await callTool(client, 'list_artifacts', { archived: true });
    const items = result.structuredContent?.items as { title: string }[];

    expect(items.map((item) => item.title)).toEqual(['Shelved']);
  });

  it('serializes the full payload into the text block', async () => {
    await callTool(client, 'publish_spec', {
      title: 'Alpha',
      description: 'First one',
      tags: ['red'],
      spec: itineraryFixture,
    });

    const result = await callTool(client, 'list_artifacts', {});
    const payload = jsonOf(result);

    expect(payload).toEqual(result.structuredContent);
    expect(payload.count).toBe(1);
    expect(payload.nextCursor).toBeNull();
    expect(payload.items).toEqual([
      {
        id: expect.any(String),
        title: 'Alpha',
        description: 'First one',
        type: 'spec',
        tags: ['red'],
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
        stateUpdatedAt: null,
        url: expect.stringContaining('http://localhost:3000/a/'),
      },
    ]);
  });

  it('returns every artifact regardless of the spec/html mix', async () => {
    await callTool(client, 'publish_spec', { title: 'One', spec: itineraryFixture });
    await callTool(client, 'publish_html', { title: 'Two', html: '<html>b</html>' });
    await callTool(client, 'publish_spec', { title: 'Three', spec: comparisonFixture });
    await callTool(client, 'publish_html', { title: 'Four', html: '<html>d</html>' });

    const payload = jsonOf(await callTool(client, 'list_artifacts', {}));

    expect(payload.count).toBe(4);
    expect((payload.items as { title: string }[]).map((item) => item.title).sort()).toEqual([
      'Four',
      'One',
      'Three',
      'Two',
    ]);
  });

  it('carries stateUpdatedAt: null until the owner interacts, then the state timestamp', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    const before = await callTool(client, 'list_artifacts', {});
    const beforeItems = before.structuredContent?.items as {
      id: string;
      stateUpdatedAt: unknown;
    }[];
    expect(beforeItems.find((item) => item.id === id)?.stateUpdatedAt).toBeNull();

    setArtifactState(db, id, { done: true });

    const after = await callTool(client, 'list_artifacts', {});
    const afterItems = after.structuredContent?.items as { id: string; stateUpdatedAt: unknown }[];
    expect(afterItems.find((item) => item.id === id)?.stateUpdatedAt).toEqual(expect.any(Number));
  });
});

describe('list_tags', () => {
  it('returns the seeded tag vocabulary sorted alphabetically', async () => {
    await callTool(client, 'publish_spec', {
      title: 'One',
      tags: ['zebra', 'apple'],
      spec: itineraryFixture,
    });
    await callTool(client, 'publish_html', {
      title: 'Two',
      tags: ['mango'],
      html: '<html>b</html>',
    });

    const result = await callTool(client, 'list_tags');

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.tags).toEqual(['apple', 'mango', 'zebra']);
    expect(textOf(result)).toContain('3 tags: apple, mango, zebra');
  });
});

describe('manage_tags', () => {
  async function seedTagged(): Promise<void> {
    await callTool(client, 'publish_spec', {
      title: 'One',
      tags: ['travel', 'food'],
      spec: itineraryFixture,
    });
    await callTool(client, 'publish_html', {
      title: 'Two',
      tags: ['trips'],
      html: '<html>b</html>',
    });
  }

  it('renames a tag into an existing one, merging the vocabulary', async () => {
    await seedTagged();
    expect((await callTool(client, 'list_tags')).structuredContent?.tags).toEqual([
      'food',
      'travel',
      'trips',
    ]);

    const result = await callTool(client, 'manage_tags', {
      action: 'rename',
      tag: 'trips',
      to: 'travel',
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      action: 'rename',
      tag: 'trips',
      to: 'travel',
      affected: 1,
    });
    expect(textOf(result)).toContain('Renamed tag "trips" to "travel" on 1 artifact.');
    expect((await callTool(client, 'list_tags')).structuredContent?.tags).toEqual([
      'food',
      'travel',
    ]);
  });

  it('deletes a tag from every artifact carrying it', async () => {
    await seedTagged();

    const result = await callTool(client, 'manage_tags', { action: 'delete', tag: 'travel' });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ action: 'delete', tag: 'travel', affected: 1 });
    expect((await callTool(client, 'list_tags')).structuredContent?.tags).toEqual([
      'food',
      'trips',
    ]);
  });

  it('reports 0 affected for a tag nothing carries, rather than erroring', async () => {
    await seedTagged();

    const result = await callTool(client, 'manage_tags', { action: 'delete', tag: 'nope' });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.affected).toBe(0);
  });

  it('errors when rename is called without a target tag', async () => {
    await seedTagged();

    const result = await callTool(client, 'manage_tags', { action: 'rename', tag: 'trips' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('requires a non-empty "to"');
    expect((await callTool(client, 'list_tags')).structuredContent?.tags).toEqual([
      'food',
      'travel',
      'trips',
    ]);
  });

  /**
   * Tag normalization strips double quotes, so a `to` of '""' is non-empty going in and nothing
   * coming out - which used to rename the tag into nothing (deleting it everywhere) while the tool
   * reported a successful rename. Guard on the normalized value, not the raw one.
   */
  it('errors on a rename target that normalizes away to nothing, changing no data', async () => {
    await seedTagged();

    const result = await callTool(client, 'manage_tags', {
      action: 'rename',
      tag: 'trips',
      to: '""',
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('requires a non-empty "to"');
    expect((await callTool(client, 'list_tags')).structuredContent?.tags).toEqual([
      'food',
      'travel',
      'trips',
    ]);
  });

  it('rejects a rename target longer than the tag cap', async () => {
    await seedTagged();

    const result = await callTool(client, 'manage_tags', {
      action: 'rename',
      tag: 'trips',
      to: 'x'.repeat(51),
    });

    expect(result.isError).toBe(true);
    expect((await callTool(client, 'list_tags')).structuredContent?.tags).toEqual([
      'food',
      'travel',
      'trips',
    ]);
  });

  it('renames into the normalized tag, and echoes that rather than the raw input', async () => {
    await seedTagged();

    const result = await callTool(client, 'manage_tags', {
      action: 'rename',
      tag: 'trips',
      to: '  "journeys"  ',
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      action: 'rename',
      tag: 'trips',
      to: 'journeys',
      affected: 1,
    });
    expect(textOf(result)).toContain('Renamed tag "trips" to "journeys" on 1 artifact.');
    expect((await callTool(client, 'list_tags')).structuredContent?.tags).toEqual([
      'food',
      'journeys',
      'travel',
    ]);
  });
});

describe('get_artifact', () => {
  it('fetches a specific version and lists all available versions', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    await callTool(client, 'update_artifact', { id, spec: comparisonFixture });

    const v1 = await callTool(client, 'get_artifact', { id, version: 1 });
    expect(v1.structuredContent?.version).toBe(1);
    expect(v1.structuredContent?.versions).toEqual([1, 2]);

    const latest = await callTool(client, 'get_artifact', { id });
    expect(latest.structuredContent?.version).toBe(2);
  });

  it('distinguishes a missing version from a missing artifact', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    const missingVersion = await callTool(client, 'get_artifact', { id, version: 5 });
    expect(missingVersion.isError).toBe(true);
    expect(textOf(missingVersion)).toContain('no version 5');

    const missingArtifact = await callTool(client, 'get_artifact', {
      id: 'does-not-exist',
      version: 5,
    });
    expect(missingArtifact.isError).toBe(true);
    expect(textOf(missingArtifact)).toContain('list_artifacts');
  });

  it('serializes the full payload into the text block', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      description: 'A doc',
      tags: ['red'],
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    setArtifactState(db, id, { done: true });

    const result = await callTool(client, 'get_artifact', { id });
    const payload = jsonOf(result);

    expect(payload).toEqual(result.structuredContent);
    expect(payload).toEqual({
      id,
      title: 'Doc',
      description: 'A doc',
      type: 'spec',
      tags: ['red'],
      url: `http://localhost:3000/a/${id}`,
      version: 1,
      body: JSON.stringify(itineraryFixture),
      versions: [1],
      state: { done: true },
      stateUpdatedAt: expect.any(Number),
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
  });

  it('carries state and stateUpdatedAt: null before interaction, populated after', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    const before = await callTool(client, 'get_artifact', { id });
    expect(before.structuredContent?.state).toBeNull();
    expect(before.structuredContent?.stateUpdatedAt).toBeNull();

    setArtifactState(db, id, { done: true });

    const after = await callTool(client, 'get_artifact', { id });
    expect(after.structuredContent?.state).toEqual({ done: true });
    expect(after.structuredContent?.stateUpdatedAt).toEqual(expect.any(Number));
  });
});

describe('set_artifact_archived', () => {
  it('round-trips an artifact out of and back into the default listing', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    const archived = await callTool(client, 'set_artifact_archived', { id, archived: true });
    expect(archived.isError).toBeFalsy();
    expect(archived.structuredContent).toEqual({ id, archived: true });

    const hidden = await callTool(client, 'list_artifacts', {});
    expect(hidden.structuredContent?.items).toEqual([]);
    // Archived artifacts stay fetchable by id.
    expect((await callTool(client, 'get_artifact', { id })).isError).toBeFalsy();

    const restored = await callTool(client, 'set_artifact_archived', { id, archived: false });
    expect(restored.structuredContent).toEqual({ id, archived: false });

    const visible = await callTool(client, 'list_artifacts', {});
    expect((visible.structuredContent?.items as { id: string }[]).map((item) => item.id)).toEqual([
      id,
    ]);
  });

  it('is idempotent: archiving an already archived artifact still succeeds', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    await callTool(client, 'set_artifact_archived', { id, archived: true });
    const second = await callTool(client, 'set_artifact_archived', { id, archived: true });

    expect(second.isError).toBeFalsy();
    expect(second.structuredContent).toEqual({ id, archived: true });
  });

  it('reports not-found for an unknown id', async () => {
    const result = await callTool(client, 'set_artifact_archived', {
      id: 'does-not-exist',
      archived: true,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('list_artifacts');
  });
});

describe('delete_artifact', () => {
  it('soft-deletes, then get_artifact reports not-found with a list_artifacts hint', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    const deleted = await callTool(client, 'delete_artifact', { id });
    expect(deleted.isError).toBeFalsy();

    const getResult = await callTool(client, 'get_artifact', { id });
    expect(getResult.isError).toBe(true);
    expect(textOf(getResult)).toContain('list_artifacts');
  });

  it('is idempotent: deleting an already soft-deleted artifact still succeeds', async () => {
    const published = await callTool(client, 'publish_spec', {
      title: 'Doc',
      spec: itineraryFixture,
    });
    const id = published.structuredContent?.id as string;

    await callTool(client, 'delete_artifact', { id });
    const second = await callTool(client, 'delete_artifact', { id });

    expect(second.isError).toBeFalsy();
    expect(second.structuredContent).toMatchObject({ id, deleted: true });
  });

  it('reports not-found for an id that never existed', async () => {
    const result = await callTool(client, 'delete_artifact', { id: 'does-not-exist' });

    expect(result.isError).toBe(true);
  });
});
