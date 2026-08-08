/**
 * Counts the questions an artifact body asks (statePath-bearing catalog components) and how many
 * the owner has answered, for the "awaiting your reply" surface.
 *
 * Server-only: it pulls the catalog and the markdown parser in transitively, so only server code
 * may import it.
 *
 * Answers are addressed by JSON Pointer, not by literal key — the state store nests
 * `/tasks/cabinets` as `{ tasks: { cabinets: … } }` — so lookups go through the store's own
 * `getByPath`. `null` and `''` read as unanswered (a cleared Rating, an emptied NoteBox); `false`
 * and `0` are real values and count.
 */

import { getByPath } from '@json-render/core';
import { commentComponentsExtension } from '@tanstack/markdown/extensions/comment-components';
import { parseMarkdown } from '@tanstack/markdown/parser';

import { resolveCatalogDirective } from '@/catalog/directive';
import { collectStatePaths } from '@/catalog/validate';
import type { ArtifactType } from '@/database/repository';
import { markdownParseOptions } from '@/lib/markdown-parse-options';

export interface AnswerCount {
  answered: number;
  total: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function specStatePaths(body: string): string[] {
  const spec = parseJson(body);

  if (!isRecord(spec) || !isRecord(spec.elements)) {
    return [];
  }

  return Object.entries(spec.elements).flatMap(([key, element]) =>
    isRecord(element) ? collectStatePaths(key, element.props).map((found) => found.path) : [],
  );
}

/**
 * Walks the parsed document generically rather than by node type: both surfaces (an `exhibit` fence
 * and a `<!-- ::Name statePath="…" -->` directive) can sit inside another directive's children, and
 * only these two node shapes ever reach the catalog.
 */
function markdownStatePaths(body: string): string[] {
  const document = parseMarkdown(body, {
    ...markdownParseOptions,
    extensions: [commentComponentsExtension()],
  });

  const paths: string[] = [];

  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }

      return;
    }

    if (!isRecord(node)) {
      return;
    }

    if (node.type === 'code' && typeof node.lang === 'string' && typeof node.value === 'string') {
      if (node.lang.toLowerCase() === 'exhibit') {
        // Unparseable JSON renders as an error block and asks nothing.
        paths.push(...collectStatePaths('', parseJson(node.value)).map((found) => found.path));
      }

      return;
    }

    if (node.type === 'component') {
      // The renderer's own acceptance test, not the raw attributes: a directive it refuses to
      // render asks nothing, and counting it would leave the artifact awaiting a reply no one can
      // give. Falls through to the walk below — a `::start:Name` wrapper carries children.
      const resolved = resolveCatalogDirective(
        typeof node.name === 'string' ? node.name : undefined,
        isRecord(node.attributes) ? node.attributes : {},
      );

      if (resolved) {
        paths.push(...collectStatePaths('', resolved.props).map((found) => found.path));
      }
    }

    for (const value of Object.values(node)) {
      walk(value);
    }
  }

  walk(document.children);

  return paths;
}

/** html artifacts render in their own sandboxed page with no state store, so they ask nothing. */
export function countAnswers(
  type: ArtifactType,
  body: string,
  state: Record<string, unknown> | null,
): AnswerCount {
  if (type === 'html') {
    return { answered: 0, total: 0 };
  }

  const paths = new Set(type === 'spec' ? specStatePaths(body) : markdownStatePaths(body));

  let answered = 0;

  for (const path of paths) {
    const value = state === null ? undefined : getByPath(state, path);

    if (value !== undefined && value !== null && value !== '') {
      answered += 1;
    }
  }

  return { answered, total: paths.size };
}
