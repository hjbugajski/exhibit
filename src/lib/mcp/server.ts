import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { validateArtifactSpec } from '@/catalog/validate';
import type { ArtifactListItem, ArtifactType, Db } from '@/database/repository';
import {
  appendVersion,
  artifactExists,
  createArtifact,
  getArtifact,
  getArtifactState,
  listArtifacts,
  listTags,
  listVersions,
  softDeleteArtifact,
  updateMetadata,
} from '@/database/repository';
import { artifactSorts, artifactTypes } from '@/lib/artifact-sorts';
import { buildCatalogSummary } from '@/lib/mcp/catalog-summary';
import { checkBodySize } from '@/lib/mcp/limits';
import { normalizeTags } from '@/lib/mcp/tags';
import { artifactUrl } from '@/lib/mcp/url';

import packageJson from '../../../package.json' with { type: 'json' };

function text(value: string): CallToolResult['content'] {
  return [{ type: 'text', text: value }];
}

function errorResult(message: string, structuredContent?: Record<string, unknown>): CallToolResult {
  return { isError: true, content: text(message), structuredContent };
}

function notFoundResult(id: string): CallToolResult {
  return errorResult(
    `No artifact found with id "${id}". Call list_artifacts to see available artifacts.`,
  );
}

/** Sanity check only, per publish_html's description — not a full HTML validator. */
function looksLikeHtmlDocument(html: string): boolean {
  return /<html[\s>]/i.test(html);
}

/**
 * Runs the catalog validator and formats an isError result on failure, or `null` when `spec` is
 * valid.
 */
function validateSpecOrError(spec: Record<string, unknown>): CallToolResult | null {
  const result = validateArtifactSpec(spec);

  if (result.valid) {
    return null;
  }

  const summary = result.errors
    .map(
      (error) =>
        `- ${error.path}${error.component ? ` (${error.component})` : ''}: ${error.message}`,
    )
    .join('\n');

  return errorResult(
    `Spec is invalid (${result.errors.length} error${result.errors.length === 1 ? '' : 's'}):\n${summary}`,
    { errors: result.errors },
  );
}

/**
 * Formats an isError result when `html` fails the lightweight sanity check, or `null` when it
 * passes.
 */
function htmlDocumentOrError(html: string): CallToolResult | null {
  if (looksLikeHtmlDocument(html)) {
    return null;
  }

  return errorResult(
    'html does not look like a complete standalone document (no <html> tag found). This is a lightweight sanity check, not full validation. Include a full HTML document.',
  );
}

function artifactRow(artifact: ArtifactListItem) {
  return {
    id: artifact.id,
    title: artifact.title,
    type: artifact.type,
    tags: artifact.tags,
    updatedAt: artifact.updatedAt,
    stateUpdatedAt: artifact.stateUpdatedAt,
    url: artifactUrl(artifact.id),
  };
}

export function buildMcpServer(db: Db): McpServer {
  const server = new McpServer({ name: 'exhibit', version: packageJson.version });

  server.registerTool(
    'publish_spec',
    {
      title: 'Publish spec artifact',
      description:
        'Creates a new artifact from a json-render spec — the preferred format for documents, guides, itineraries, comparisons, checklists, and dashboards, since specs render with the gallery’s native theming. Call get_catalog once first to learn the component vocabulary and wire format. The spec is validated against the catalog; on failure you get per-element errors to fix and resubmit. Returns the artifact id and shareable url — to revise the artifact later, call update_artifact with that id instead of publishing again. Use publish_html only when the content needs custom code the catalog cannot express.',
      inputSchema: {
        title: z.string().min(1).max(200).describe('Artifact title.'),
        description: z.string().max(2000).optional().describe('Optional short description.'),
        tags: z.array(z.string().max(50)).max(20).optional().describe('Optional tags.'),
        spec: z
          .record(z.string(), z.unknown())
          .describe(
            'The json-render spec object: { root, elements }. See get_catalog for the wire format.',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ title, description, tags, spec }) => {
      const serialized = JSON.stringify(spec);
      const sizeError = checkBodySize(serialized, 'spec');

      if (sizeError) {
        return errorResult(sizeError);
      }

      const specError = validateSpecOrError(spec);

      if (specError) {
        return specError;
      }

      const { artifact, version } = createArtifact(db, {
        title,
        description,
        type: 'spec',
        tags: normalizeTags(tags),
        body: serialized,
      });
      const url = artifactUrl(artifact.id);

      return {
        content: text(
          `Published spec artifact "${artifact.title}" (${artifact.id}), version ${version.version}.`,
        ),
        structuredContent: { id: artifact.id, url, version: version.version },
      };
    },
  );

  server.registerTool(
    'publish_html',
    {
      title: 'Publish HTML artifact',
      description:
        'Creates a new artifact from a complete standalone HTML document. Prefer publish_spec — spec artifacts match the gallery’s theming and stay editable at the component level; use HTML only for content the catalog cannot express (custom visualizations, bespoke interactivity). The document renders sandboxed on its own page with no network access to the app, so inline all CSS/JS (external scripts only from cdnjs if unavoidable) and include <html>, <head>, and <body>. Returns the artifact id and shareable url — revise later with update_artifact, not a second publish.',
      inputSchema: {
        title: z.string().min(1).max(200).describe('Artifact title.'),
        description: z.string().max(2000).optional().describe('Optional short description.'),
        tags: z.array(z.string().max(50)).max(20).optional().describe('Optional tags.'),
        html: z
          .string()
          .min(1)
          .describe('Complete standalone HTML document, including <html> and <head>/<body>.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ title, description, tags, html }) => {
      const sizeError = checkBodySize(html, 'html');

      if (sizeError) {
        return errorResult(sizeError);
      }

      const htmlError = htmlDocumentOrError(html);

      if (htmlError) {
        return htmlError;
      }

      const { artifact, version } = createArtifact(db, {
        title,
        description,
        type: 'html',
        tags: normalizeTags(tags),
        body: html,
      });
      const url = artifactUrl(artifact.id);

      return {
        content: text(
          `Published HTML artifact "${artifact.title}" (${artifact.id}), version ${version.version}.`,
        ),
        structuredContent: { id: artifact.id, url, version: version.version },
      };
    },
  );

  server.registerTool(
    'get_catalog',
    {
      title: 'Get component catalog',
      description:
        'Returns the json-render component vocabulary (names, descriptions, prop shapes, children rules), the wire format, and complete example specs. Call this once before your first publish_spec or spec update_artifact of a session and author against it — specs referencing unknown components or props fail validation. Read-only and stable within a session; no need to call it again unless validation errors surprise you.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    () => {
      const { text: catalogText, structuredContent } = buildCatalogSummary();

      return { content: text(catalogText), structuredContent };
    },
  );

  server.registerTool(
    'update_artifact',
    {
      title: 'Update artifact',
      description:
        'Updates an existing artifact — the right way to revise anything already published (find ids via list_artifacts; fetch the current body via get_artifact first when editing rather than replacing). Providing `spec` or `html` appends a new version, validated per the artifact type and matching it — a spec artifact only accepts `spec`, an html artifact only `html`, and never both in one call. Providing only title/description/tags updates metadata in place with no new version; body and metadata changes can be combined. Old versions stay browsable by the owner.',
      inputSchema: {
        id: z.string().describe('Artifact id.'),
        spec: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('New spec body (for spec artifacts only).'),
        html: z.string().optional().describe('New HTML body (for html artifacts only).'),
        title: z.string().min(1).max(200).optional().describe('New title.'),
        description: z.string().max(2000).optional().describe('New description.'),
        tags: z
          .array(z.string().max(50))
          .max(20)
          .optional()
          .describe('New tag list (replaces the existing tags).'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ id, spec, html, title, description, tags }) => {
      if (spec !== undefined && html !== undefined) {
        return errorResult('Provide either spec or html, not both.');
      }

      const existing = getArtifact(db, id);

      if (!existing) {
        return notFoundResult(id);
      }

      let versionNumber = existing.version.version;

      if (spec !== undefined || html !== undefined) {
        const expectedType: ArtifactType = spec !== undefined ? 'spec' : 'html';

        if (existing.artifact.type !== expectedType) {
          return errorResult(
            `Artifact "${id}" is type "${existing.artifact.type}"; cannot update its body with a${expectedType === 'html' ? 'n' : ''} ${expectedType} payload. Provide a${existing.artifact.type === 'html' ? 'n' : ''} ${existing.artifact.type} payload instead.`,
          );
        }

        const serialized = spec !== undefined ? JSON.stringify(spec) : (html as string);
        const sizeError = checkBodySize(serialized, expectedType);

        if (sizeError) {
          return errorResult(sizeError);
        }

        if (spec !== undefined) {
          const specError = validateSpecOrError(spec);

          if (specError) {
            return specError;
          }
        }

        if (html !== undefined) {
          const htmlError = htmlDocumentOrError(html);

          if (htmlError) {
            return htmlError;
          }
        }

        versionNumber = appendVersion(db, id, serialized).version;
      }

      if (title !== undefined || description !== undefined || tags !== undefined) {
        updateMetadata(db, id, {
          title,
          description,
          tags: tags !== undefined ? normalizeTags(tags) : undefined,
        });
      }

      const url = artifactUrl(id);

      return {
        content: text(`Updated artifact "${id}", current version ${versionNumber}.`),
        structuredContent: { id, url, version: versionNumber },
      };
    },
  );

  server.registerTool(
    'list_artifacts',
    {
      title: 'List artifacts',
      description:
        'Lists published artifacts (metadata only, no bodies), sortable, with cursor pagination. Use it to find an artifact’s id before get_artifact, update_artifact, or delete_artifact, and to check what already exists before publishing something similar. Each item’s `stateUpdatedAt` is when the owner’s interaction state last changed, or null if untouched — compare against your last check to see fresh owner input.',
      inputSchema: {
        query: z.string().optional().describe('Case-insensitive substring match on title.'),
        tag: z
          .string()
          .optional()
          .describe('Filter to artifacts with this exact tag. Prefer the `tags` parameter.'),
        tags: z
          .array(z.string())
          .max(20)
          .optional()
          .describe('Filter to artifacts having any of these exact tags.'),
        type: z.enum(artifactTypes).optional().describe('Filter by artifact type.'),
        sort: z
          .enum(artifactSorts)
          .optional()
          .describe(
            'Sort order, default updated-desc: updated-desc/updated-asc (last modified), created-desc/created-asc (publish date), title-asc/title-desc (alphabetical).',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Page size, default 20, max 100.'),
        cursor: z.string().optional().describe('Cursor from a previous call’s nextCursor.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    ({ query, tag, tags, type, sort, limit, cursor }) => {
      const result = listArtifacts(db, {
        query,
        tags: tags ?? (tag ? [tag] : undefined),
        type,
        sort,
        limit,
        cursor,
      });
      const items = result.items.map(artifactRow);

      return {
        content: text(
          `${items.length} artifact${items.length === 1 ? '' : 's'}${result.nextCursor ? ' (more available)' : ''}.`,
        ),
        structuredContent: { items, nextCursor: result.nextCursor },
      };
    },
  );

  server.registerTool(
    'list_tags',
    {
      title: 'List tags',
      description:
        'Lists all tags currently in use across published artifacts, alphabetically. Call this before publishing or tagging to reuse existing tags instead of inventing near-duplicates (e.g. "trip" vs "travel").',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    () => {
      const tags = listTags(db);

      return {
        content: text(`${tags.length} tag${tags.length === 1 ? '' : 's'}: ${tags.join(', ')}`),
        structuredContent: { tags },
      };
    },
  );

  server.registerTool(
    'get_artifact',
    {
      title: 'Get artifact',
      description:
        'Fetches an artifact’s metadata and the body of a specific version (default: latest), plus the list of all available version numbers. Call it before update_artifact when revising, so your new body builds on what is actually published. `state` holds the owner’s saved interaction state (e.g. which Checklist statePath items they checked), or null if untouched. `stateUpdatedAt` is when state last changed, or null if never — compare against your last check to see fresh owner input.',
      inputSchema: {
        id: z.string().describe('Artifact id.'),
        version: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Version number; defaults to the latest.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    ({ id, version }) => {
      const result = getArtifact(db, id, version);

      if (!result) {
        // A version was requested but missed — check whether that's because the artifact itself is
        // missing/deleted, or just that version.
        if (version !== undefined && getArtifact(db, id)) {
          return errorResult(
            `Artifact "${id}" has no version ${version}. Omit version to get the latest, or call get_artifact without version first to see how many exist.`,
          );
        }

        return notFoundResult(id);
      }

      const versions = listVersions(db, id);
      const stateResult = getArtifactState(db, id);

      return {
        content: text(
          `Artifact "${result.artifact.title}" (${id}), version ${result.version.version} of ${versions.length}.`,
        ),
        structuredContent: {
          id: result.artifact.id,
          title: result.artifact.title,
          description: result.artifact.description,
          type: result.artifact.type,
          tags: result.artifact.tags,
          url: artifactUrl(id),
          version: result.version.version,
          body: result.version.body,
          versions: versions.map((v) => v.version),
          state: stateResult?.state ?? null,
          stateUpdatedAt: stateResult?.updatedAt ?? null,
        },
      };
    },
  );

  server.registerTool(
    'delete_artifact',
    {
      title: 'Delete artifact',
      description:
        'Soft-deletes an artifact and all of its versions; it stops appearing in list_artifacts and get_artifact afterward. Deleting an already-deleted artifact succeeds as a no-op. To revise content, prefer update_artifact — it keeps the artifact’s id, url, and version history.',
      inputSchema: { id: z.string().describe('Artifact id.') },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    ({ id }) => {
      const existing = getArtifact(db, id);

      if (existing) {
        softDeleteArtifact(db, id);

        return {
          content: text(`Deleted artifact "${existing.artifact.title}" (${id}).`),
          structuredContent: { id, deleted: true },
        };
      }

      // idempotentHint: true means repeat calls must succeed rather than error, so an already
      // soft-deleted artifact is a no-op success, not a not-found — only a truly unknown id is
      // not-found.
      if (!artifactExists(db, id)) {
        return notFoundResult(id);
      }

      return {
        content: text(`Artifact "${id}" is already deleted.`),
        structuredContent: { id, deleted: true },
      };
    },
  );

  return server;
}
