import '@tanstack/react-start/server-only';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { ALLOWED_FAMILIES } from '@/catalog/mermaid-schema';
import {
  findStatePathConflicts,
  validateArtifactSpec,
  type ArtifactSpecError,
} from '@/catalog/validate';
import type { ArtifactListItem, Db } from '@/database/repository';
import {
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
  updateArtifact,
} from '@/database/repository';
import { markdownStatePaths } from '@/lib/answer-count';
import { descriptionField, tagField, tagsField, titleField } from '@/lib/artifact-metadata';
import { artifactSorts } from '@/lib/artifact-sorts';
import { artifactTypes, type ArtifactType } from '@/lib/artifact-types';
import { buildCatalogSummary } from '@/lib/mcp/catalog-summary';
import { checkBodySize } from '@/lib/mcp/limits';
import type { McpToolName } from '@/lib/mcp/tool-names';
import { artifactUrl } from '@/lib/mcp/url';
import { normalizeTags } from '@/lib/normalize-tags';

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
    `No artifact has the id "${id}". Call list_artifacts to see the available artifacts.`,
  );
}

/** Shared by every tool that resolves a version number, so the wording can't drift between them. */
function noSuchVersionResult(id: string, version: number): CallToolResult {
  return errorResult(
    `Artifact "${id}" has no version ${version}. Call get_artifact without a version to see which versions exist.`,
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
function validateSpecOrError(spec: unknown): CallToolResult | null {
  const result = validateArtifactSpec(spec);

  return result.valid ? null : specErrorsResult('Spec', result.errors);
}

/** Lists `errors` in the message and returns them as `structuredContent.errors`. */
function specErrorsResult(subject: string, errors: ArtifactSpecError[]): CallToolResult {
  const summary = errors
    .map(
      (error) =>
        `- ${error.path}${error.component ? ` (${error.component})` : ''}: ${error.message}`,
    )
    .join('\n');

  return errorResult(
    `${subject} is invalid (${errors.length} error${errors.length === 1 ? '' : 's'}):\n${summary}`,
    { errors },
  );
}

/**
 * Formats an isError result when the statePaths a markdown body renders overlap (the same rule
 * specs follow), or `null` otherwise. Errors name the component, since markdown has no element
 * keys.
 */
function markdownStatePathsOrError(markdown: string): CallToolResult | null {
  const errors = findStatePathConflicts(markdownStatePaths(markdown)).map(
    ({ keys, message }): ArtifactSpecError => ({
      element: null,
      component: keys[0] ?? null,
      path: 'statePath',
      message,
    }),
  );

  return errors.length === 0 ? null : specErrorsResult('Markdown', errors);
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
    'The html body has no <html> tag, so it is not a complete standalone document. This check is a lightweight sanity check, not full validation. Pass a complete HTML document.',
  );
}

/** Formats an isError result when `markdown` is empty or whitespace only, or `null` otherwise. */
function markdownBodyOrError(markdown: string): CallToolResult | null {
  if (markdown.trim() !== '') {
    return null;
  }

  return errorResult(
    'The markdown body has no content: it is empty or only whitespace. Pass the markdown document body.',
  );
}

/**
 * Per-type body checks over the serialized body. The `Record` makes a new `ArtifactType` a compile
 * error here; add a type's further checks inside its own entry.
 */
const bodyChecks: Record<ArtifactType, (body: string) => CallToolResult | null> = {
  spec: (body) => validateSpecOrError(JSON.parse(body)),
  html: htmlDocumentOrError,
  markdown: (body) => markdownBodyOrError(body) ?? markdownStatePathsOrError(body),
};

/** Returns an isError result when `body` fails the size cap or its type's check, else `null`. */
function validateBody(type: ArtifactType, body: string): CallToolResult | null {
  const sizeError = checkBodySize(body, type);

  if (sizeError) {
    return errorResult(sizeError);
  }

  return bodyChecks[type](body);
}

/** Artifact type names as they read in the publish confirmation. */
const publishLabels: Record<ArtifactType, string> = {
  spec: 'spec',
  html: 'HTML',
  markdown: 'markdown',
};

/** Closes every publish tool description: what the call returns and how to revise the result. */
const PUBLISH_RESULT_DESCRIPTION =
  'Returns the artifact id and url. The url opens only for the gallery owner, because it requires the owner’s session. It is not a link to share. To revise the artifact, call update_artifact with its id instead of publishing again.';

/** Validates `input.body`, creates the artifact, and formats the publish response. */
function publishArtifact(
  db: Db,
  type: ArtifactType,
  input: { title: string; description?: string; tags?: string[]; body: string },
): CallToolResult {
  const bodyError = validateBody(type, input.body);

  if (bodyError) {
    return bodyError;
  }

  const { artifact, version } = createArtifact(db, {
    title: input.title,
    description: input.description,
    type,
    tags: normalizeTags(input.tags),
    body: input.body,
  });
  const url = artifactUrl(artifact.id);

  return {
    content: text(
      `Published ${publishLabels[type]} artifact "${artifact.title}" (${artifact.id}), version ${version.version}: ${url}`,
    ),
    structuredContent: { id: artifact.id, url, version: version.version },
  };
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
      description: `Creates a new artifact from a json-render spec. Specs are the preferred format for documents, guides, itineraries, comparisons, checklists, and dashboards, because they render with the gallery’s native theming. Before you publish, call get_catalog once to learn the component vocabulary and the wire format. The server validates the spec against the catalog. If validation fails, the result lists the errors for each element. Fix the errors and publish again. Use publish_html only when the content needs custom code that the catalog cannot express. ${PUBLISH_RESULT_DESCRIPTION}`,
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
    ({ title, description, tags, spec }) =>
      publishArtifact(db, 'spec', { title, description, tags, body: JSON.stringify(spec) }),
  );

  server.registerTool(
    toolName('publish_html'),
    {
      title: 'Publish HTML artifact',
      description: `Creates a new artifact from a complete standalone HTML document. Prefer publish_spec, because spec artifacts match the gallery’s theming and stay editable at the component level. Use HTML only for content that the catalog cannot express, such as custom visualizations or bespoke interactivity. The document renders sandboxed on its own page under a strict CSP:\n- Fetch, XHR, and WebSocket connections are blocked entirely, so the page must work with zero network calls.\n- Scripts and styles must be inline or load from cdnjs.cloudflare.com.\n- Images and fonts can come from any https: URL or a data: URI.\nThe document must include <html>, <head>, and <body>. ${PUBLISH_RESULT_DESCRIPTION}`,
      inputSchema: {
        title: titleField.describe('Artifact title.'),
        description: descriptionField.optional().describe('Optional short description.'),
        tags: tagsField.optional().describe('Optional tags.'),
        html: z
          .string()
          .min(1)
          .describe('Complete standalone HTML document with <html>, <head>, and <body>.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ title, description, tags, html }) =>
      publishArtifact(db, 'html', { title, description, tags, body: html }),
  );

  server.registerTool(
    toolName('publish_markdown'),
    {
      title: 'Publish markdown artifact',
      description: `Creates a new artifact from a markdown document. Use markdown for prose-first content that does not need spec-level structure, such as notes, briefs, explainers, meeting summaries, and research write-ups. The gallery renders GFM tables, task lists, strikethrough, footnotes, and syntax-highlighted code fences. Two rules differ from most markdown renderers by design:\n- Raw HTML is never interpreted. It shows as literal text, so do not use it.\n- Bare URLs do not autolink. Write explicit links, such as [text](https://example.com).\nLinks render only for http(s) URLs, and images only for https: URLs. Anything else is dropped. Catalog components embed in two ways:\n1. A comment directive. For a component with no content, write \`<!-- ::Divider -->\`. To wrap markdown inside a container component (Section, Card, Itinerary, or Day), write \`<!-- ::start:Card title="Budget" -->\` … markdown … \`<!-- ::end:Card -->\`. Directive attributes are flat strings, so they carry only text and enum props. A component whose props need numbers or arrays, such as Grid or Tabs, cannot be a directive. For those components, use an exhibit fence or publish_spec.\n2. An \`exhibit\` code fence whose body is JSON \`{ "type": "Chart", "props": { ... } }\`. The fence holds one component with full prop types. Use it for any component that needs numbers, booleans, arrays, or objects, such as Chart, Table, Callout, Checklist, or KeyValueList.\nCall get_catalog for component names and prop shapes. A \`mermaid\` code fence draws these diagram types: ${ALLOWED_FAMILIES}. Any other diagram type shows the source with the reason. Checklist, Choice, Rating, and NoteBox take a statePath. They persist the owner’s input as they do in specs, and get_artifact reads it back. As in specs, a statePath is rejected if it equals another statePath or is a segment prefix of one, such as \`/feedback\` and \`/feedback/note\`. If the content is mostly structured components rather than prose, prefer publish_spec. ${PUBLISH_RESULT_DESCRIPTION}`,
      inputSchema: {
        title: titleField.describe('Artifact title.'),
        description: descriptionField.optional().describe('Optional short description.'),
        tags: tagsField.optional().describe('Optional tags.'),
        markdown: z.string().min(1).describe('The markdown document body.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ title, description, tags, markdown }) =>
      publishArtifact(db, 'markdown', { title, description, tags, body: markdown }),
  );

  server.registerTool(
    toolName('get_catalog'),
    {
      title: 'Get component catalog',
      description:
        'Returns the json-render component vocabulary, the wire format, and complete example specs. For each component, the vocabulary lists the name, description, prop shapes, and children rules. Call get_catalog before the first publish_spec call or spec update of a session, and write specs against it. A spec that references an unknown component or prop fails validation. The result does not change within a session. One call per session is enough.',
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
        'Updates an existing artifact. Use it to revise anything already published. Call list_artifacts to find the id. If you edit the body rather than replace it, call get_artifact first to fetch the current body. Passing a body appends a new version, which the server validates for the artifact type. The body key must match the artifact type:\n- `spec` for a spec artifact\n- `html` for an html artifact\n- `markdown` for a markdown artifact\nPass at most one body in a single call. If you pass only title, description, or tags, the metadata changes in place and no new version is created. You can combine body and metadata changes in one call. The owner can still browse old versions.',
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
          `Pass at most one body payload. This call passed ${provided.map((entry) => entry.type).join(' and ')}.`,
        );
      }

      const existing = getArtifact(db, id);

      if (!existing) {
        return notFoundResult(id);
      }

      const update = provided[0];

      if (update) {
        if (existing.artifact.type !== update.type) {
          return errorResult(
            `Artifact "${id}" is type "${existing.artifact.type}", so it does not accept ${article(update.type)} ${update.type} payload. Pass ${article(existing.artifact.type)} ${existing.artifact.type} payload instead.`,
          );
        }

        const bodyError = validateBody(update.type, update.body);

        if (bodyError) {
          return bodyError;
        }
      }

      const updated = updateArtifact(db, id, {
        body: update?.body,
        title,
        description,
        tags: tags !== undefined ? normalizeTags(tags) : undefined,
      });

      if (!updated) {
        return notFoundResult(id);
      }

      const versionNumber = updated.version.version;
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
        'Makes an earlier version of an artifact the current one. The tool copies that version’s body forward as a new latest version. Nothing is overwritten or removed, so the history stays intact. To undo a restore, restore the version that preceded it. Use this tool rather than passing an old body from get_artifact to update_artifact, because the copy is exact. Call get_artifact to see which version numbers exist.',
      inputSchema: {
        id: z.string().describe('Artifact id.'),
        version: z.number().int().positive().describe('Version number to restore.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    ({ id, version }) => {
      const restored = revertToVersion(db, id, version);

      if (!restored) {
        return getArtifact(db, id) ? noSuchVersionResult(id, version) : notFoundResult(id);
      }

      const url = artifactUrl(id);

      return {
        content: text(
          `Restored version ${version} of "${restored.artifact.title}" as version ${restored.version.version}: ${url}`,
        ),
        structuredContent: { id, url, version: restored.version.version },
      };
    },
  );

  server.registerTool(
    toolName('list_artifacts'),
    {
      title: 'List artifacts',
      description:
        'Lists published artifacts with metadata only, no bodies. The list is sortable and uses cursor pagination. Call it to find an artifact’s id before get_artifact, update_artifact, or delete_artifact. Also call it to check what already exists before you publish something similar. The list excludes archived artifacts. If you pass `archived: true`, the list holds only archived artifacts. Each item’s `stateUpdatedAt` is when the owner’s interaction state last changed, or null if the state is untouched. To find fresh owner input, pass `sort: "state-updated-desc"` and `hasState: true`. To limit the result to input at or after a timestamp, pass `stateSince`.',
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe('Case-insensitive substring match on title or description.'),
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
            'If omitted, the list holds only unarchived artifacts. If true, the list holds only archived artifacts.',
          ),
        hasState: z
          .boolean()
          .optional()
          .describe(
            'True lists only artifacts with owner interaction state. False lists only untouched artifacts. Omit to list both.',
          ),
        stateSince: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            'Epoch milliseconds. Lists only artifacts whose state changed at or after this time. Untouched artifacts never match.',
          ),
        sort: z
          .enum(artifactSorts)
          .optional()
          .describe(
            'Sort order. The default is updated-desc. updated-desc and updated-asc sort by last modification. created-desc and created-asc sort by publish date. title-asc and title-desc sort alphabetically. state-updated-desc sorts by last owner interaction, with untouched artifacts last.',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Page size. The default is 20 and the maximum is 100.'),
        cursor: z.string().optional().describe('Cursor from a previous call’s nextCursor.'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    ({ query, tag, tags, type, archived, hasState, stateSince, sort, limit, cursor }) => {
      const result = listArtifacts(db, {
        query,
        tags: tags ?? (tag ? [tag] : undefined),
        type,
        archived,
        hasState,
        stateSince,
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
        'Lists every tag in use across published artifacts, in alphabetical order. Before you publish or tag an artifact, call list_tags. Reuse existing tags instead of inventing near-duplicates, such as "trip" and "travel".',
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
        'Consolidates the tag vocabulary across the whole gallery. Each session chooses tags with no memory of earlier sessions, so near-duplicates accumulate, such as "trip", "trips", and "travel". list_tags helps you avoid new near-duplicates. manage_tags fixes the ones that already exist:\n- action "rename" renames a tag on every artifact that carries it. If the new name is an existing tag, the two tags merge and no duplicate remains.\n- action "delete" removes a tag from every artifact. The artifacts themselves are untouched.\nBoth actions also apply to archived and deleted artifacts, so a restored artifact comes back with the corrected tags. A tag that no artifact carries is not an error, and the result reports `affected: 0`. Call list_tags first to see the exact spellings.',
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
          `action "rename" requires a non-empty "to". Pass the tag name to rename "${tag}" into. To remove the tag instead, call manage_tags with action "delete".`,
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
        'Fetches an artifact’s metadata, the body of one version, and the list of all version numbers. The version defaults to the latest. Before you revise an artifact with update_artifact, call get_artifact, so the new body builds on what is published. `state` holds the owner’s saved interaction state, or null if it is untouched. For example, `state` records which Checklist items the owner checked under a statePath. `stateUpdatedAt` is when the state last changed, or null if it never changed. To find fresh owner input across artifacts, call list_artifacts with `sort: "state-updated-desc"`.',
      inputSchema: {
        id: z.string().describe('Artifact id.'),
        version: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Version number. Defaults to the latest.'),
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
        'Archives an artifact, or restores an archived one. Archiving keeps the artifact, its versions, and its url intact, and get_artifact can still fetch it. An archived artifact drops out of list_artifacts unless you pass `archived: true`. Use archiving to clear finished work out of the default listing. Use delete_artifact only when the artifact must stop existing.',
      inputSchema: {
        id: z.string().describe('Artifact id.'),
        archived: z.boolean().describe('true to archive, false to restore to the default listing.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    ({ id, archived }) => {
      const artifact = setArtifactArchived(db, id, archived);

      if (!artifact) {
        return notFoundResult(id);
      }

      return {
        content: text(
          `${archived ? 'Archived' : 'Unarchived'} artifact "${artifact.title}" (${id}).`,
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
        'Soft-deletes an artifact and all of its versions. After the delete, list_artifacts and get_artifact no longer return the artifact. Deleting an already deleted artifact succeeds and changes nothing. To revise content, prefer update_artifact, because it keeps the artifact’s id, url, and version history.',
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
