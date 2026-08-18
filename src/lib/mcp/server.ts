import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { validateArtifactSpec } from '@/catalog/validate';
import { ALLOWED_FAMILIES } from '@/components/catalog/mermaid-schema';
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
  removeTag,
  renameTag,
  revertToVersion,
  setArtifactArchived,
  softDeleteArtifact,
  updateMetadata,
} from '@/database/repository';
import {
  descriptionField,
  normalizeTags,
  tagField,
  tagsField,
  titleField,
} from '@/lib/artifact-metadata';
import { artifactSorts, artifactTypes } from '@/lib/artifact-sorts';
import { buildCatalogSummary } from '@/lib/mcp/catalog-summary';
import { checkBodySize } from '@/lib/mcp/limits';
import type { McpToolName } from '@/lib/mcp/tool-names';
import { artifactUrl } from '@/lib/mcp/url';

import packageJson from '../../../package.json' with { type: 'json' };

/**
 * Constrains a registration to a declared tool name, so the tool list can't drift from
 * `MCP_TOOL_NAMES` (the docs table is an exhaustive record over the same union). Missing or extra
 * registrations are caught by the `tools/list` assertion in server.int.test.ts.
 */
function toolName(name: McpToolName): string {
  return name;
}

function text(value: string): CallToolResult['content'] {
  return [{ type: 'text', text: value }];
}

/**
 * Read-tool response shape: a summary line, then the complete payload serialized as JSON, with the
 * same object in `structuredContent`. Many MCP clients (claude.ai among them) surface only text
 * content, so the two representations must never diverge — building both here guarantees it.
 */
function textWithJson(summary: string, payload: Record<string, unknown>): CallToolResult {
  return {
    content: text(`${summary}\n${JSON.stringify(payload)}`),
    structuredContent: payload,
  };
}

function errorResult(message: string, structuredContent?: Record<string, unknown>): CallToolResult {
  return { isError: true, content: text(message), structuredContent };
}

function notFoundResult(id: string): CallToolResult {
  return errorResult(
    `No artifact found with id "${id}". Call list_artifacts to see available artifacts.`,
  );
}

/** Shared by every tool that resolves a version number, so the wording can't drift between them. */
function noSuchVersionResult(id: string, version: number): CallToolResult {
  return errorResult(
    `Artifact "${id}" has no version ${version}. Call get_artifact without version to see which versions exist.`,
  );
}

/** Indefinite article for an artifact type name, for error prose. */
function article(type: ArtifactType): string {
  return type === 'html' ? 'an' : 'a';
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
    description: artifact.description,
    type: artifact.type,
    tags: artifact.tags,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    stateUpdatedAt: artifact.stateUpdatedAt,
    url: artifactUrl(artifact.id),
  };
}

/**
 * Builds a fresh server for a single request: stateless JSON mode gives each POST its own server and
 * transport (see src/routes/mcp.ts), so `db` is captured by the tool handlers and nothing may be
 * cached across requests here.
 */
export function buildMcpServer(db: Db): McpServer {
  const server = new McpServer({ name: 'exhibit', version: packageJson.version });

  server.registerTool(
    toolName('publish_spec'),
    {
      title: 'Publish spec artifact',
      description:
        'Creates a new artifact from a json-render spec — the preferred format for documents, guides, itineraries, comparisons, checklists, and dashboards, since specs render with the gallery’s native theming. Call get_catalog once first to learn the component vocabulary and wire format. The spec is validated against the catalog; on failure you get per-element errors to fix and resubmit. Returns the artifact id and url — the url opens for the gallery owner only, since it requires their session, so it is not a link to share. To revise the artifact later, call update_artifact with that id instead of publishing again. Use publish_html only when the content needs custom code the catalog cannot express.',
      inputSchema: {
        title: titleField.describe('Artifact title.'),
        description: descriptionField.optional().describe('Optional short description.'),
        tags: tagsField.optional().describe('Optional tags.'),
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
          `Published spec artifact "${artifact.title}" (${artifact.id}), version ${version.version}: ${url}`,
        ),
        structuredContent: { id: artifact.id, url, version: version.version },
      };
    },
  );

  server.registerTool(
    toolName('publish_html'),
    {
      title: 'Publish HTML artifact',
      description:
        'Creates a new artifact from a complete standalone HTML document. Prefer publish_spec — spec artifacts match the gallery’s theming and stay editable at the component level; use HTML only for content the catalog cannot express (custom visualizations, bespoke interactivity). The document renders sandboxed on its own page under a strict CSP: fetch, XHR, and WebSocket connections are blocked entirely, so the page must work with zero network calls; scripts and styles must be inline or loaded from cdnjs.cloudflare.com; images and fonts may come from any https: URL or a data: URI. Include <html>, <head>, and <body>. Returns the artifact id and url — the url opens for the gallery owner only, since it requires their session, so it is not a link to share. Revise later with update_artifact, not a second publish.',
      inputSchema: {
        title: titleField.describe('Artifact title.'),
        description: descriptionField.optional().describe('Optional short description.'),
        tags: tagsField.optional().describe('Optional tags.'),
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
          `Published HTML artifact "${artifact.title}" (${artifact.id}), version ${version.version}: ${url}`,
        ),
        structuredContent: { id: artifact.id, url, version: version.version },
      };
    },
  );

  server.registerTool(
    toolName('publish_markdown'),
    {
      title: 'Publish markdown artifact',
      description:
        'Creates a new artifact from a markdown document — the quickest format for prose-first content (notes, briefs, explainers, meeting summaries, research write-ups) that does not need spec-level structure. Renders in the gallery with GFM tables, task lists, strikethrough and footnotes, and syntax-highlighted code fences. Two deliberate differences from most markdown renderers: raw HTML is never interpreted (it shows as literal text — do not reach for it), and bare URLs do not autolink, so write explicit [text](https://example.com) links. Links render only for http(s) URLs and images only for https: URLs; anything else is dropped. Catalog components embed two ways. (1) Comment directive — `<!-- ::Divider -->` for a component with no content, or `<!-- ::start:Card title="Budget" -->` … markdown … `<!-- ::end:Card -->` to wrap markdown inside a container component (Section, Card, Itinerary, Day). Directive attributes are flat strings, so they only carry text and enum props — components whose props need numbers or arrays (Grid, Tabs) cannot be driven by a directive; use an exhibit fence or publish_spec for those. (2) An `exhibit` code fence whose body is JSON `{ "type": "Chart", "props": { ... } }` — one component, full prop types, for anything needing numbers, booleans, arrays or objects (Chart, Table, Callout, Checklist, KeyValueList, ...). Call get_catalog for component names and prop shapes. A `mermaid` code fence renders as a diagram (' +
        ALLOWED_FAMILIES +
        '); any other diagram type shows the source with the reason instead. Components with a statePath (Checklist, Choice, Rating, NoteBox) persist the owner’s input exactly as they do in specs, readable back through get_artifact. Prefer publish_spec when the content is mostly structured components rather than prose. Returns the artifact id and url — the url opens for the gallery owner only, since it requires their session, so it is not a link to share. Revise later with update_artifact, not a second publish.',
      inputSchema: {
        title: titleField.describe('Artifact title.'),
        description: descriptionField.optional().describe('Optional short description.'),
        tags: tagsField.optional().describe('Optional tags.'),
        markdown: z.string().min(1).describe('The markdown document body.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ title, description, tags, markdown }) => {
      const sizeError = checkBodySize(markdown, 'markdown');

      if (sizeError) {
        return errorResult(sizeError);
      }

      const { artifact, version } = createArtifact(db, {
        title,
        description,
        type: 'markdown',
        tags: normalizeTags(tags),
        body: markdown,
      });
      const url = artifactUrl(artifact.id);

      return {
        content: text(
          `Published markdown artifact "${artifact.title}" (${artifact.id}), version ${version.version}: ${url}`,
        ),
        structuredContent: { id: artifact.id, url, version: version.version },
      };
    },
  );

  server.registerTool(
    toolName('get_catalog'),
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
    toolName('update_artifact'),
    {
      title: 'Update artifact',
      description:
        'Updates an existing artifact — the right way to revise anything already published (find ids via list_artifacts; fetch the current body via get_artifact first when editing rather than replacing). Providing `spec`, `html` or `markdown` appends a new version, validated per the artifact type and matching it — a spec artifact only accepts `spec`, an html artifact only `html`, a markdown artifact only `markdown`, and never more than one in a single call. Providing only title/description/tags updates metadata in place with no new version; body and metadata changes can be combined. Old versions stay browsable by the owner.',
      inputSchema: {
        id: z.string().describe('Artifact id.'),
        spec: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('New spec body (for spec artifacts only).'),
        html: z.string().optional().describe('New HTML body (for html artifacts only).'),
        markdown: z
          .string()
          .optional()
          .describe('New markdown body (for markdown artifacts only).'),
        title: titleField.optional().describe('New title.'),
        description: descriptionField.optional().describe('New description.'),
        tags: tagsField.optional().describe('New tag list (replaces the existing tags).'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ id, spec, html, markdown, title, description, tags }) => {
      // Exhaustive over ArtifactType, so a fourth type is a compile error here rather than a
      // silently unhandled payload.
      const bodies: Record<ArtifactType, string | undefined> = {
        spec: spec !== undefined ? JSON.stringify(spec) : undefined,
        html,
        markdown,
      };
      const provided = Object.entries(bodies).flatMap(([type, body]) =>
        body === undefined ? [] : [{ type: type as ArtifactType, body }],
      );

      if (provided.length > 1) {
        return errorResult(
          `Provide at most one body payload; got ${provided.map((entry) => entry.type).join(' and ')}.`,
        );
      }

      const existing = getArtifact(db, id);

      if (!existing) {
        return notFoundResult(id);
      }

      let versionNumber = existing.version.version;
      const update = provided[0];

      if (update) {
        if (existing.artifact.type !== update.type) {
          return errorResult(
            `Artifact "${id}" is type "${existing.artifact.type}"; cannot update its body with ${article(update.type)} ${update.type} payload. Provide ${article(existing.artifact.type)} ${existing.artifact.type} payload instead.`,
          );
        }

        const sizeError = checkBodySize(update.body, update.type);

        if (sizeError) {
          return errorResult(sizeError);
        }

        // Markdown bodies are arbitrary prose — size is the only check they get.
        const bodyError =
          update.type === 'spec'
            ? validateSpecOrError(spec as Record<string, unknown>)
            : update.type === 'html'
              ? htmlDocumentOrError(update.body)
              : null;

        if (bodyError) {
          return bodyError;
        }

        versionNumber = appendVersion(db, id, update.body).version;
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
        content: text(`Updated artifact "${id}", current version ${versionNumber}: ${url}`),
        structuredContent: { id, url, version: versionNumber },
      };
    },
  );

  server.registerTool(
    toolName('restore_version'),
    {
      title: 'Restore an earlier version',
      description:
        'Brings an earlier version of an artifact back as the current one, by copying that version’s body forward as a new latest version. Nothing is overwritten or removed — the history stays intact, and the restore itself can be undone by restoring the version that preceded it. Use this instead of fetching an old body with get_artifact and resubmitting it through update_artifact: the copy is exact. Call get_artifact to see which version numbers exist.',
      inputSchema: {
        id: z.string().describe('Artifact id.'),
        version: z.number().int().positive().describe('Version number to restore.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ id, version }) => {
      const existing = getArtifact(db, id);

      if (!existing) {
        return notFoundResult(id);
      }

      const restored = revertToVersion(db, id, version);

      if (!restored) {
        return noSuchVersionResult(id, version);
      }

      const url = artifactUrl(id);

      return {
        content: text(
          `Restored version ${version} of "${existing.artifact.title}" as version ${restored.version}: ${url}`,
        ),
        structuredContent: { id, url, version: restored.version },
      };
    },
  );

  server.registerTool(
    toolName('list_artifacts'),
    {
      title: 'List artifacts',
      description:
        'Lists published artifacts (metadata only, no bodies), sortable, with cursor pagination. Use it to find an artifact’s id before get_artifact, update_artifact, or delete_artifact, and to check what already exists before publishing something similar. Archived artifacts are excluded unless you pass `archived: true`, which returns those and only those. Each item’s `stateUpdatedAt` is when the owner’s interaction state last changed, or null if untouched — compare against your last check to see fresh owner input.',
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
        archived: z
          .boolean()
          .optional()
          .describe(
            'Omit (the default) to list only unarchived artifacts; true to list only archived ones.',
          ),
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
    ({ query, tag, tags, type, archived, sort, limit, cursor }) => {
      const result = listArtifacts(db, {
        query,
        tags: tags ?? (tag ? [tag] : undefined),
        type,
        archived,
        sort,
        limit,
        cursor,
      });
      const items = result.items.map(artifactRow);

      return textWithJson(
        `${items.length} ${archived ? 'archived' : 'unarchived'} artifact${items.length === 1 ? '' : 's'}${result.nextCursor ? ' (more available)' : ''}.`,
        // `count` is this page's length — a real match total would need its own COUNT(*), and a
        // field named `total` next to a non-null nextCursor read as a contradiction.
        { items, count: items.length, nextCursor: result.nextCursor },
      );
    },
  );

  server.registerTool(
    toolName('list_tags'),
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
    toolName('manage_tags'),
    {
      title: 'Rename or delete a tag',
      description:
        'Consolidates the tag vocabulary across the whole gallery. Tags are chosen one session at a time with no memory of earlier ones, so near-duplicates accumulate ("trip" / "trips" / "travel"); list_tags only helps you avoid new ones, this fixes the ones already there. action "rename" renames a tag on every artifact that carries it — renaming into a tag that already exists merges the two, leaving no duplicates. action "delete" removes a tag from every artifact; the artifacts themselves are untouched. Both apply to archived and deleted artifacts too, so a restored artifact comes back with the corrected tags. A tag nothing carries is not an error — you get affected 0. Call list_tags first to see the exact spellings.',
      inputSchema: {
        action: z.enum(['rename', 'delete']).describe('"rename" a tag, or "delete" it everywhere.'),
        tag: z.string().min(1).describe('The existing tag to rename or delete.'),
        to: tagField
          .min(1)
          .optional()
          .describe(
            'Required for "rename": the new tag name. If it already exists, the two tags merge.',
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    ({ action, tag, to }) => {
      if (action === 'delete') {
        const affected = removeTag(db, tag);

        return {
          content: text(
            `Deleted tag "${tag}" from ${affected} artifact${affected === 1 ? '' : 's'}.`,
          ),
          structuredContent: { action, tag, affected },
        };
      }

      // Normalize before the guard, not after: normalizeTags strips quotes, so a `to` of '""'
      // passes a non-empty check and then renames the tag into nothing — the tag vanishes from
      // every artifact while the tool reports a rename. Same guard as renameTagFn in
      // src/lib/artifacts.ts.
      const [normalized] = normalizeTags([to ?? '']);

      if (!normalized) {
        return errorResult(
          `action "rename" requires a non-empty "to" — the tag name to rename "${tag}" into. To remove the tag instead, call manage_tags with action "delete".`,
        );
      }

      const affected = renameTag(db, tag, normalized);

      return {
        content: text(
          `Renamed tag "${tag}" to "${normalized}" on ${affected} artifact${affected === 1 ? '' : 's'}.`,
        ),
        structuredContent: { action, tag, to: normalized, affected },
      };
    },
  );

  server.registerTool(
    toolName('get_artifact'),
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
          return noSuchVersionResult(id, version);
        }

        return notFoundResult(id);
      }

      const versions = listVersions(db, id);
      const stateResult = getArtifactState(db, id);

      return textWithJson(
        `Artifact "${result.artifact.title}" (${id}), version ${result.version.version} of ${versions.length}.`,
        {
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
          createdAt: result.artifact.createdAt,
          updatedAt: result.artifact.updatedAt,
        },
      );
    },
  );

  server.registerTool(
    toolName('set_artifact_archived'),
    {
      title: 'Archive or unarchive artifact',
      description:
        'Archives an artifact, or restores an archived one. Archiving keeps the artifact, its versions, and its url intact and still fetchable by get_artifact — it only drops out of list_artifacts unless you ask for `archived: true`. Use it to clear finished work out of the default listing; use delete_artifact only when the artifact should stop existing.',
      inputSchema: {
        id: z.string().describe('Artifact id.'),
        archived: z.boolean().describe('true to archive, false to restore to the default listing.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    ({ id, archived }) => {
      const existing = getArtifact(db, id);

      if (!existing) {
        return notFoundResult(id);
      }

      setArtifactArchived(db, id, archived);

      return {
        content: text(
          `${archived ? 'Archived' : 'Unarchived'} artifact "${existing.artifact.title}" (${id}).`,
        ),
        structuredContent: { id, archived },
      };
    },
  );

  server.registerTool(
    toolName('delete_artifact'),
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
