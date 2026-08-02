/**
 * The two ways a markdown artifact reaches the component catalog. Both are untrusted input — the
 * markdown body is arbitrary AI-authored text — so both share one rule: a name is looked up in the
 * catalog, props are parsed by that component's own Zod schema, and only the parser's output is
 * ever handed to a component. Raw attributes are never spread onto anything.
 *
 * `CatalogDirective` is mapped to `md-comment-component` in markdown-view.tsx, and that mapping is
 * MANDATORY: @tanstack/markdown renders an unmapped component node as a literal
 * `<md-comment-component>` element with the directive's attributes serialized into one inert
 * `data-attributes` JSON blob — nothing executes, but no component renders and the raw payload
 * lands in the DOM.
 *
 * Both render under the `JSONUIProvider` that MarkdownView installs, so an embedded Checklist,
 * Choice, Rating or NoteBox reads and writes the same state store a spec artifact's components do.
 */
import type { ReactNode } from 'react';

import type { Spec } from '@json-render/core';
import { Renderer } from '@json-render/react';
import type { z } from 'zod';

import { catalog } from '@/catalog/catalog';
import { catalogComponents, registry } from '@/catalog/registry';
import { validateArtifactSpec, type ArtifactSpecError } from '@/catalog/validate';
import { HighlightedCode } from '@/components/blocks/highlighted-code';
import { flowBlock } from '@/components/catalog/flow';

/**
 * Island wrapper for catalog output dispatched from markdown. Typography's element rules tie with
 * component utilities on specificity and can win on order, so inside `.prose` the component's own
 * layout cannot defend itself — the island carries the flow rhythm and is the hook the styles.css
 * embed rules key on to keep prose typography out of component interiors. Directive children are
 * markdown again and re-enter prose styling via `data-md-prose`.
 */
function EmbedIsland({ children }: { children: ReactNode }) {
  return (
    <div className={flowBlock} data-md-embed="">
      {children}
    </div>
  );
}

/** Widened to an index signature so an arbitrary name from markdown can be looked up. */
const componentDefinitions = catalog.data.components as Record<
  string,
  { props: z.ZodType } | undefined
>;

/**
 * Catalog components are each typed against their own props; widened to one signature so the same
 * lookup works. What flows into `props` is always Zod's output, never the raw attributes.
 */
const components = catalogComponents as unknown as Record<
  string,
  ((props: { props: unknown; children?: ReactNode }) => ReactNode) | undefined
>;

/** The comment-component parser lowercases directive names; catalog names are PascalCase. */
const canonicalNames = new Map(
  Object.keys(catalog.data.components).map((name) => [name.toLowerCase(), name]),
);

function parseJson(value: string | undefined): unknown {
  if (value === undefined) {
    return {};
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * A `<!-- ::Name attr="v" -->` directive, or a `::start:Name`/`::end:Name` pair wrapping markdown.
 * Attributes are flat strings, so directives carry text and enum props only — anything structured
 * belongs in an exhibit fence. An unknown component or props that fail validation render nothing:
 * a half-configured component is worse than an absent one, and the author sees the same document
 * Claude published in the Source tab.
 */
export function CatalogDirective({
  'data-component': name,
  'data-attributes': attributes,
  children,
}: {
  'data-component'?: string;
  'data-attributes'?: string;
  children?: ReactNode;
}) {
  const canonical = name ? canonicalNames.get(name.toLowerCase()) : undefined;
  const definition = canonical ? componentDefinitions[canonical] : undefined;
  const Component = canonical ? components[canonical] : undefined;

  if (!definition || !Component) {
    return null;
  }

  const parsed = definition.props.safeParse(parseJson(attributes));

  if (!parsed.success) {
    return null;
  }

  // The renderer always passes children positionally, so a childless `<!-- ::Name -->` arrives
  // with an empty array, never null — without the length check it would hand every component an
  // empty prose div (dead space inside Card/Section, an empty first cell in Columns).
  const body = Array.isArray(children) && children.length === 0 ? undefined : children;

  return (
    <EmbedIsland>
      <Component props={parsed.data}>
        {body == null ? undefined : <div data-md-prose="">{body}</div>}
      </Component>
    </EmbedIsland>
  );
}

function ExhibitError({ json, message }: { json: string; message: string }) {
  // A <div>, not a <p>: typography's paragraph margins would push the message off the code block.
  return (
    <EmbedIsland>
      <div className="flex flex-col gap-2">
        <div className="text-danger text-sm">{message}</div>
        <HighlightedCode
          className="bg-surface-muted overflow-x-auto rounded-lg p-4 text-sm"
          code={json}
          language="json"
        />
      </div>
    </EmbedIsland>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `elements.exhibit.props.kind` is the validator's internal addressing for the one-element spec
 * wrapper; the author wrote `props.kind`, so that is the path they can act on.
 */
function formatExhibitError(error: ArtifactSpecError): string {
  const path = error.path.replace(/^elements\.exhibit\.?/, '');

  return path ? `${path}: ${error.message}` : error.message;
}

/**
 * An ```exhibit fence: one component as JSON (`{ "type": …, "props": … }`), validated by the same
 * catalog validator the publish tools use, then rendered as a one-element spec. Unlike a directive
 * this degrades loudly — the JSON shows as a code block with the reason — because the content is
 * inert either way and the feedback is what gets the next version right.
 */
export function ExhibitBlock({ json }: { json: string }) {
  const parsed = parseJson(json);

  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    return (
      <ExhibitError
        json={json}
        message='This exhibit block isn’t a JSON object with a `type` — expected { "type": ComponentName, "props": { … } }.'
      />
    );
  }

  const spec: Spec = {
    root: 'exhibit',
    elements: { exhibit: { type: parsed.type, props: parsed.props ?? {}, children: [] } },
  } as unknown as Spec;

  const result = validateArtifactSpec(spec);

  if (!result.valid) {
    return (
      <ExhibitError
        json={json}
        message={`This exhibit block didn’t validate: ${result.errors.map(formatExhibitError).join(' ')}`}
      />
    );
  }

  return (
    <EmbedIsland>
      <Renderer registry={registry} spec={result.spec} />
    </EmbedIsland>
  );
}
