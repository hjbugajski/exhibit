import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { comparisonFixture } from '@/catalog/fixtures/comparison';
import { itineraryFixture } from '@/catalog/fixtures/itinerary';
import type { Db } from '@/database/repository';
import { setArtifactArchived, setArtifactState } from '@/database/repository';
import { buildMcpServer } from '@/lib/mcp/server';
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

let db: Db;
let client: Client;

beforeEach(async () => {
  ({ db, sqlite } = createTestDb());
  client = await connectClient(db);
});

afterEach(() => {
  sqlite.close();
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
