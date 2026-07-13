/**
 * Builds the get_catalog tool's payload: a compact textual description of every catalog component
 * plus a couple of trimmed example specs. Kept under ~4k tokens (see catalog-summary.unit.test.ts)
 * so it's cheap for Claude to read before every publish_spec call.
 */
import { z } from 'zod';

import { catalog } from '@/catalog/catalog';
import { comparisonFixture } from '@/catalog/fixtures/comparison';
import { explainerFixture } from '@/catalog/fixtures/explainer';
import { itineraryFixture } from '@/catalog/fixtures/itinerary';

/** Renders a Zod schema as a short type expression, e.g. `'left'|'center'|'right'`. */
function summarizeType(schema: z.core.$ZodType): string {
  const unwrapped = schema instanceof z.ZodOptional ? schema.unwrap() : schema;

  if (unwrapped instanceof z.ZodLiteral) {
    return JSON.stringify(unwrapped.value);
  }

  if (unwrapped instanceof z.ZodEnum) {
    return Object.values(unwrapped.enum)
      .map((v) => JSON.stringify(v))
      .join('|');
  }

  if (unwrapped instanceof z.ZodUnion) {
    return unwrapped.options.map((o: z.core.$ZodType) => summarizeType(o)).join('|');
  }

  if (unwrapped instanceof z.ZodArray) {
    return `${summarizeType(unwrapped.element)}[]`;
  }

  if (unwrapped instanceof z.ZodRecord) {
    return `Record<string, ${summarizeType(unwrapped.valueType)}>`;
  }

  if (unwrapped instanceof z.ZodObject) {
    const shape = unwrapped.shape as Record<string, z.core.$ZodType>;

    return `{ ${Object.entries(shape)
      .map(
        ([key, value]) =>
          `${key}${value instanceof z.ZodOptional ? '?' : ''}: ${summarizeType(value)}`,
      )
      .join(', ')} }`;
  }

  if (unwrapped instanceof z.ZodString) {
    return 'string';
  }

  if (unwrapped instanceof z.ZodNumber) {
    return 'number';
  }

  if (unwrapped instanceof z.ZodBoolean) {
    return 'boolean';
  }

  return 'unknown';
}

function summarizeProps(props: z.core.$ZodType): string {
  if (!(props instanceof z.ZodObject)) {
    return summarizeType(props);
  }

  const shape = props.shape as Record<string, z.ZodType>;
  const entries = Object.entries(shape);

  if (entries.length === 0) {
    return '(none)';
  }

  return entries
    .map(([key, value]) => {
      const optional = value instanceof z.ZodOptional;
      const description = value.description;

      return `${key}${optional ? '?' : ''}: ${summarizeType(value)}${description ? ` — ${description}` : ''}`;
    })
    .join('; ');
}

function componentLines(): string {
  const components = catalog.data.components as Record<
    string,
    { slots?: string[]; description: string; props: z.core.$ZodType }
  >;

  return Object.entries(components)
    .map(([name, def]) => {
      const childRule = def.slots?.length
        ? `children: ${def.slots.join(', ')} slot(s) allowed`
        : 'leaf (no children)';

      return `## ${name}\n${def.description}\n${childRule}\nprops: ${summarizeProps(def.props)}`;
    })
    .join('\n\n');
}

const WIRE_FORMAT_REMINDER = `WIRE FORMAT: a spec is { root: string, elements: { [elementKey]: { type: ComponentName, props: {...}, children: string[] } } }. \`root\` is the key of the top-level element in \`elements\`. \`children\` is an array of other keys in \`elements\` (empty for leaf components). Every key referenced anywhere (root, children) must exist in \`elements\`; do not leave dangling references or orphaned elements.`;

/** Compact JSON examples, trimmed from the catalog fixtures to keep token cost low. */
function exampleSpecs(): string {
  const trimmedItinerary = {
    ...itineraryFixture,
    elements: Object.fromEntries(
      Object.entries(itineraryFixture.elements).filter(
        ([key]) => key === 'itinerary' || key === 'day-1' || key.startsWith('stop-1'),
      ),
    ),
  };

  return [
    ['Itinerary (multi-day trip)', trimmedItinerary],
    ['Explainer (Prose/Callout/Steps/Details)', explainerFixture],
    ['Comparison (Grid/Card/Table/Badge)', comparisonFixture],
  ]
    .map(([label, spec]) => `### ${label as string}\n${JSON.stringify(spec)}`)
    .join('\n\n');
}

export interface CatalogSummary {
  text: string;
  structuredContent: { components: string; wireFormat: string; examples: string };
}

let cached: CatalogSummary | undefined;

/**
 * The get_catalog payload; computed once and cached for the process lifetime — catalog/fixture
 * edits need a restart to show up.
 */
export function buildCatalogSummary(): CatalogSummary {
  cached ??= (() => {
    const components = componentLines();
    const examples = exampleSpecs();

    const text = `${WIRE_FORMAT_REMINDER}\n\n# Components\n\n${components}\n\n# Examples\n\n${examples}`;

    return {
      text,
      structuredContent: { components, wireFormat: WIRE_FORMAT_REMINDER, examples },
    };
  })();

  return cached;
}
