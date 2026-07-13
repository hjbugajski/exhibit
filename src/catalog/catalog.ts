/**
 * Component catalog for the json-render spec renderer. Both the MCP server (tool-side validation,
 * src/lib/mcp/server.ts) and the React renderer (src/catalog/registry.tsx) import this catalog so
 * the two never drift.
 *
 * Descriptions are read by Claude via the `get_catalog` MCP tool — keep them crisp and instructive;
 * they're the only documentation Claude sees when composing a spec.
 *
 * Every array and string field carries a generous but finite `.max()`: safety caps against a
 * hostile-but-schema-valid spec (a Chart with millions of points, a multi-megabyte markdown string)
 * hitting React/recharts/react-markdown — a real browser-DoS vector for the owner viewing rendered
 * artifacts. SHORT_MAX covers titles/labels/short strings, LONG_MAX long-form markdown/prose/code;
 * a few array fields use their own bound where that's obviously right (documented inline).
 */

import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { z } from 'zod';

/** Generous cap for a title/label/short string field. */
const SHORT_MAX = 500;
/** Generous cap for a long-form markdown/prose/code field. */
const LONG_MAX = 100_000;

const columns = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const align = z.enum(['left', 'center', 'right']);
const statePath = z
  .string()
  .max(SHORT_MAX)
  .regex(/^\/[\w/-]+$/, 'must be a JSON Pointer like /tasks/order-cabinets');
const latLng = z.object({
  lat: z.number().min(-90).max(90).describe('Latitude in decimal degrees.'),
  lng: z.number().min(-180).max(180).describe('Longitude in decimal degrees.'),
});
const listItemId = z
  .string()
  .min(1)
  .max(SHORT_MAX)
  .describe('Unique id for this item within the list; stable across versions.');

/**
 * Zod check flagging string values that appear more than once in an array, keyed by `pick` — one
 * issue per duplicated value, attached to the array. The check also runs when sibling items have
 * their own schema errors, so `pick` must tolerate garbage; non-string picks are skipped.
 */
function uniqueBy<Item>(
  pick: (item: Item) => unknown,
  describe: (value: string) => string,
): z.core.CheckFn<Item[]> {
  return (payload) => {
    const seen = new Set<string>();
    const flagged = new Set<string>();

    for (const item of payload.value) {
      const value = pick(item);

      if (typeof value !== 'string') {
        continue;
      }

      if (seen.has(value) && !flagged.has(value)) {
        flagged.add(value);
        payload.issues.push({
          code: 'custom',
          input: payload.value,
          message: describe(value),
          continue: true,
        });
      }

      seen.add(value);
    }
  };
}

/**
 * Enforces `listItemId` uniqueness within a list prop: duplicate ids collide as React keys and, for
 * Choice, as the value stored at statePath.
 */
const uniqueIds = uniqueBy(
  (item: { id?: unknown } | null | undefined) => item?.id,
  (id) => `Item id "${id}" is used more than once; ids must be unique within the list.`,
);

export const catalog = defineCatalog(schema, {
  components: {
    // Layout
    Section: {
      slots: ['default'],
      description:
        'Top-level page section with an anchor; groups related content under an optional title. Use one per major topic in a document.',
      props: z.object({
        title: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Section heading text, shown above the content.'),
        subtitle: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Supporting line shown under the title, smaller and muted.'),
      }),
    },
    Grid: {
      slots: ['default'],
      description:
        'Grid of children with consistent spacing. 1 column is the default vertical-flow container; 2–4 columns suit cards or short items that compare well side by side.',
      props: z.object({
        columns: columns.describe(
          'Number of columns at desktop width (1–4). Always collapses to 1 column on small screens.',
        ),
      }),
    },
    Columns: {
      slots: ['default'],
      description:
        'Exactly two children rendered side by side; stacks vertically on mobile. Use for a pairwise comparison or side-by-side text and image.',
      props: z.object({
        ratio: z
          .enum(['1:1', '1:2', '2:1'])
          .optional()
          .describe('Relative width of the two children. Defaults to 1:1 (equal width).'),
      }),
    },
    Tabs: {
      slots: ['default'],
      description:
        'Tabbed container: one label per child, child i renders under items[i]. Use for alternate views of the same topic (e.g. two proposals, before/after). Give each tab exactly one child — use a 1-column Grid to group multiple blocks.',
      props: z.object({
        items: z
          .array(z.string().max(SHORT_MAX))
          .min(2)
          .max(500)
          // Duplicate labels collide as React keys (one TabsTrigger/TabsContent pair per label) and
          // are ambiguous for the reader besides.
          .check(
            uniqueBy(
              (label: unknown) => label,
              (label) =>
                `Tab label "${label}" is used more than once; labels must be unique within a Tabs element.`,
            ),
          )
          .describe('Tab labels in order; must match the number of children.'),
      }),
    },
    Divider: {
      description:
        'Horizontal separator line between blocks. Use sparingly — block spacing usually suffices.',
      props: z.object({}),
    },

    // Typography
    Heading: {
      description:
        'Standalone heading, independent of Section titles. Use sparingly — prefer Section title/subtitle for structure.',
      props: z.object({
        level: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .describe('Heading rank: 1 is largest (page title), 3 is smallest.'),
        text: z.string().min(1).max(SHORT_MAX).describe('The heading text.'),
      }),
    },
    Prose: {
      description:
        'Markdown-rendered body text — the primary workhorse for paragraphs, lists, links, bold/italic, and blockquotes. Use for any free-form writing.',
      props: z.object({
        markdown: z
          .string()
          .max(LONG_MAX)
          .describe(
            'CommonMark + GFM markdown source. Raw HTML is stripped; links must be http(s) to render.',
          ),
      }),
    },
    Callout: {
      description:
        'Boxed aside that draws attention to a tip, warning, success note, or side note. Use sparingly — one or two per section, not for every paragraph.',
      props: z.object({
        variant: z
          .enum(['default', 'info', 'success', 'warning', 'danger'])
          .describe(
            'Tone: default (aside, least urgent), info (neutral tip), success (good news / confirmation), warning (caution), danger (problem / blocker).',
          ),
        title: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Optional short heading for the callout.'),
        markdown: z.string().max(LONG_MAX).describe('Markdown body of the callout.'),
      }),
    },
    Quote: {
      description:
        'Block quotation, optionally attributed. Use for a notable quote from a source, guide, or person — not for emphasis on your own writing.',
      props: z.object({
        markdown: z.string().max(LONG_MAX).describe('Markdown content of the quotation.'),
        attribution: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Who or what the quote is attributed to, shown below the quote.'),
      }),
    },
    CodeBlock: {
      description:
        'Standalone code block with an optional filename header and a copy button. Prefer this over fenced code in Prose when the code is a deliverable the reader will copy.',
      props: z.object({
        code: z.string().max(LONG_MAX).describe('The code, verbatim (no fences).'),
        language: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Language name shown in the header, e.g. "ts".'),
        filename: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Filename shown in the header, e.g. "vite.config.ts".'),
      }),
    },

    // Structure
    Card: {
      slots: ['default'],
      description:
        'Bordered container for a self-contained chunk of content — pair with Grid for a set of comparable cards. With `value` it doubles as a key metric (label, big value, optional delta with trend arrow); put several in a Grid for a metrics row.',
      props: z
        .object({
          title: z.string().max(SHORT_MAX).optional().describe('Card heading.'),
          subtitle: z.string().max(SHORT_MAX).optional().describe('Muted line under the title.'),
          badge: z
            .string()
            .max(SHORT_MAX)
            .optional()
            .describe('Short label shown in the corner, e.g. a price or status.'),
          value: z
            .string()
            .max(SHORT_MAX)
            .optional()
            .describe('Headline metric value, preformatted, e.g. "$48.2k".'),
          delta: z
            .string()
            .max(SHORT_MAX)
            .optional()
            .describe('Change vs a prior period, preformatted, e.g. "+12% vs Q1". Needs `value`.'),
          trend: z
            .enum(['up', 'down', 'flat'])
            .optional()
            .describe(
              'Arrow and color for the delta: up (green), down (red), flat (muted). Pick by desirability, not just sign. Defaults to flat.',
            ),
        })
        .refine((props) => props.value !== undefined || (!props.delta && !props.trend), {
          message: '`delta` and `trend` require `value`.',
          path: ['value'],
        }),
    },
    Table: {
      description:
        'Data table for structured rows and columns. Cell values are plain strings — no markdown; use for facts and figures, not for prose.',
      props: z.object({
        columns: z
          .array(
            z.object({
              key: z.string().max(SHORT_MAX).describe('Key matching a field in each row object.'),
              label: z.string().max(SHORT_MAX).describe('Column header text.'),
              align: align.optional().describe('Text alignment for this column; defaults to left.'),
            }),
          )
          // A table with more columns than fit a screen isn't useful; 30 is already far past any
          // legible table.
          .max(30)
          // Two columns sharing a key silently render the same value twice.
          .check(
            uniqueBy(
              (column: { key?: unknown } | null | undefined) => column?.key,
              (key) =>
                `Column key "${key}" is used more than once; column keys must be unique within a Table element.`,
            ),
          )
          .describe('Column definitions, left to right.'),
        rows: z
          .array(z.record(z.string().max(SHORT_MAX), z.string().max(SHORT_MAX)))
          // Generous for real data dumps, well short of a rendering hazard.
          .max(2_000)
          .describe('Row data; each row maps column key to a plain string value.'),
      }),
    },
    KeyValueList: {
      description:
        'Compact list of label/value pairs, like a spec sheet. Use for facts that do not need a full table (price, duration, dates, etc).',
      props: z.object({
        items: z
          .array(
            z.object({
              id: listItemId,
              key: z.string().max(SHORT_MAX).describe('Label text.'),
              value: z.string().max(SHORT_MAX).describe('Value text.'),
            }),
          )
          .max(500)
          .check(uniqueIds)
          .describe('Ordered list of label/value pairs.'),
        columns: z
          .union([z.literal(1), z.literal(2)])
          .optional()
          .describe('Lay out pairs in 1 (default) or 2 columns.'),
      }),
    },
    Steps: {
      description:
        'Ordered, numbered sequence of instructions. Use for a procedure the reader should follow in order.',
      props: z.object({
        items: z
          .array(
            z.object({
              id: listItemId,
              title: z.string().max(SHORT_MAX).describe('Short label for this step.'),
              markdown: z
                .string()
                .max(LONG_MAX)
                .optional()
                .describe('Optional markdown detail shown under the step title.'),
            }),
          )
          .max(500)
          .check(uniqueIds)
          .describe('Ordered steps, rendered 1, 2, 3, ...'),
      }),
    },
    Timeline: {
      description:
        'Chronological sequence of dated/timed entries. Use for a history, schedule, or sequence of events (not step-by-step instructions — use Steps for that).',
      props: z.object({
        items: z
          .array(
            z.object({
              id: listItemId,
              label: z
                .string()
                .max(SHORT_MAX)
                .describe('Date or time string for this entry, e.g. "9:00 AM" or "March 2024".'),
              title: z.string().max(SHORT_MAX).describe('Short title for the event.'),
              markdown: z.string().max(LONG_MAX).optional().describe('Optional markdown detail.'),
            }),
          )
          .max(500)
          .check(uniqueIds)
          .describe('Ordered timeline entries, earliest first.'),
      }),
    },
    Checklist: {
      description:
        'Checklist of items. Items with a statePath are interactive: the owner can toggle them in the browser and the state persists (readable back via get_artifact). Omit statePath for display-only items.',
      props: z.object({
        items: z
          .array(
            z.object({
              id: listItemId,
              text: z.string().max(SHORT_MAX).describe('Item text.'),
              checked: z
                .boolean()
                .optional()
                .describe(
                  'Whether the item starts checked; defaults to unchecked. For stateful items this is only the default — saved state wins.',
                ),
              statePath: statePath
                .optional()
                .describe(
                  'JSON Pointer under which the checked state is stored, e.g. "/tasks/order-cabinets". Presence makes the item interactive and persisted; keep paths stable across versions.',
                ),
            }),
          )
          .max(500)
          .check(uniqueIds)
          .describe('Checklist items in display order.'),
      }),
    },
    Details: {
      description:
        'Collapsible disclosure, collapsed by default. Use for optional detail, fine print, or an aside the reader can expand on demand.',
      props: z.object({
        summary: z
          .string()
          .max(SHORT_MAX)
          .describe('Always-visible label the reader clicks to expand.'),
        markdown: z.string().max(LONG_MAX).describe('Markdown content revealed when expanded.'),
      }),
    },
    Badge: {
      description:
        'Small inline label for a status or tag, e.g. "Best value" or "Sold out". Use inline within Card badge/titles or KeyValueList values, not as a standalone block.',
      props: z.object({
        text: z.string().min(1).max(SHORT_MAX).describe('Badge text — keep to a word or two.'),
        variant: z
          .enum(['default', 'info', 'success', 'warning', 'danger'])
          .optional()
          .describe(
            'Color: default (neutral), info (informational), success (positive), warning (caution), danger (negative). Defaults to default.',
          ),
      }),
    },
    Figure: {
      description:
        'Image with an optional caption. The URL must be https and publicly reachable; the image is lazy-loaded and sent without a referrer.',
      props: z.object({
        src: z
          .string()
          .max(2_000)
          .regex(/^https:\/\//, 'must be an https URL')
          .describe('Absolute https URL of the image.'),
        alt: z.string().max(SHORT_MAX).describe('Alt text describing the image.'),
        caption: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Caption shown under the image, muted.'),
      }),
    },

    // Data & metrics
    Progress: {
      description:
        'Horizontal progress bar with an optional label and a percentage readout. Use for completion or capacity — a value from 0 to 100.',
      props: z.object({
        label: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('What the bar measures, e.g. "Demo phase".'),
        value: z.number().min(0).max(100).describe('Percent complete, 0-100.'),
      }),
    },
    Chart: {
      description:
        'Simple single-series bar or line chart. Use for a numeric series over categories or time; keep to ~4-24 points. For exact values, prefer Table.',
      props: z.object({
        kind: z.enum(['bar', 'line']).describe('bar for categories, line for trends over time.'),
        data: z
          .array(
            z.object({
              label: z.string().max(SHORT_MAX).describe('Category or time label for the x-axis.'),
              value: z.number().describe('Numeric value for the y-axis.'),
            }),
          )
          .min(2)
          // Recharts renders every point to SVG; 5k is generous for a real series and well short of
          // a rendering hazard.
          .max(5_000)
          .describe('Ordered data points, left to right.'),
        valueLabel: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Name of the series shown in the tooltip, e.g. "Cost ($)".'),
      }),
    },

    Map: {
      description:
        'Interactive street map with labeled markers and optional route paths. The view fits the data automatically; give center/zoom only for a plain map with no markers or paths.',
      props: z.object({
        center: latLng
          .optional()
          .describe('Initial center; usually omit and let markers/paths fit the view.'),
        zoom: z
          .number()
          .min(1)
          .max(18)
          .optional()
          .describe('Initial zoom level (1 world - 18 street); usually omit.'),
        markers: z
          .array(
            latLng.extend({
              id: listItemId,
              label: z.string().max(SHORT_MAX).describe('Short label shown next to the marker.'),
              description: z
                .string()
                .max(SHORT_MAX)
                .optional()
                .describe('Detail shown in a popup when the marker is clicked.'),
            }),
          )
          .max(500)
          .check(uniqueIds)
          .optional()
          .describe('Points of interest to pin on the map.'),
        paths: z
          .array(
            z.object({
              id: listItemId,
              points: z.array(latLng).min(2).max(500).describe('Waypoints of the path, in order.'),
              dashed: z
                .boolean()
                .optional()
                .describe('Render the path dashed, e.g. for a planned or alternate leg.'),
            }),
          )
          .max(500)
          .check(uniqueIds)
          .optional()
          .describe(
            'Routes drawn as lines connecting waypoints (straight segments, not road-following).',
          ),
      }),
    },

    // Interactive
    Choice: {
      description:
        'Single-select question the owner answers in the browser; the chosen option id is stored at statePath and persists (readable back via get_artifact). Use to ask the owner to pick between options — designs, plans, variants.',
      props: z.object({
        label: z
          .string()
          .max(SHORT_MAX)
          .describe('The question or prompt, e.g. "Which direction should I take?"'),
        options: z
          .array(
            z.object({
              id: listItemId.describe(
                'Unique id for this option within the list; this exact string is stored when selected. Stable across versions.',
              ),
              label: z.string().max(SHORT_MAX).describe('Option text.'),
              description: z
                .string()
                .max(SHORT_MAX)
                .optional()
                .describe('Muted detail line shown under the option.'),
            }),
          )
          .min(2)
          .max(500)
          // Duplicate labels are semantically ambiguous (which "Yes" did the owner pick?) even when
          // the stored ids differ.
          .check(
            uniqueIds,
            uniqueBy(
              (option: { label?: unknown } | null | undefined) => option?.label,
              (label) =>
                `Choice option "${label}" is used more than once; option labels must be unique within a Choice element.`,
            ),
          )
          .describe('Options in display order.'),
        statePath: statePath.describe(
          'JSON Pointer where the selected option id is stored, e.g. "/decisions/logo-direction". Keep paths stable across versions.',
        ),
      }),
    },
    NoteBox: {
      description:
        'Free-form text box the owner can type into; the text is stored at statePath and persists (readable back via get_artifact). Use to collect feedback or an answer to an open question.',
      props: z.object({
        label: z
          .string()
          .max(SHORT_MAX)
          .describe('What you are asking for, e.g. "Anything to change?"'),
        placeholder: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Hint text shown while the box is empty.'),
        statePath: statePath.describe(
          'JSON Pointer where the text is stored, e.g. "/feedback/homepage". Keep paths stable across versions.',
        ),
      }),
    },
    Rating: {
      description:
        'Five-star rating the owner sets in the browser; the number (1-5) is stored at statePath and persists (readable back via get_artifact). Use to ask the owner to score an option or result.',
      props: z.object({
        label: z.string().max(SHORT_MAX).describe('What is being rated, e.g. "Draft 2".'),
        statePath: statePath.describe(
          'JSON Pointer where the rating number is stored, e.g. "/ratings/draft-2". Keep paths stable across versions.',
        ),
      }),
    },

    // Travel
    Itinerary: {
      slots: ['default'],
      description:
        'Top-level container for a multi-day trip; children must be Day elements. Use once per itinerary document.',
      props: z.object({
        title: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Itinerary title, e.g. "Kyoto in Five Days".'),
        dateRange: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Human-readable date range, e.g. "May 3 - May 8, 2026".'),
      }),
    },
    Day: {
      slots: ['default'],
      description:
        'One day within an Itinerary; children must be Stop elements. Use one per day of the trip.',
      props: z.object({
        label: z.string().max(SHORT_MAX).describe('Day label, e.g. "Day 1 — Saturday".'),
        date: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Calendar date for this day, e.g. "May 3, 2026".'),
        summary: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('One-line summary of the day, shown under the label.'),
      }),
    },
    Stop: {
      description:
        'A single stop within a Day: a meal, activity, place to stay, or leg of travel. The most granular unit of an itinerary.',
      props: z.object({
        time: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Clock time for this stop, e.g. "9:30 AM".'),
        duration: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('How long this stop takes, e.g. "1.5 hours".'),
        title: z.string().max(SHORT_MAX).describe('Name of the stop, e.g. "Fushimi Inari Shrine".'),
        location: z.string().max(SHORT_MAX).optional().describe('Neighborhood, address, or area.'),
        markdown: z
          .string()
          .max(LONG_MAX)
          .optional()
          .describe('Markdown detail: what to do, tips, booking info.'),
        kind: z
          .enum(['food', 'activity', 'lodging', 'travel', 'other'])
          .optional()
          .describe(
            'Category driving the stop icon: food (fork/knife), activity (compass), lodging (bed), travel (plane), other (pin). Defaults to other.',
          ),
      }),
    },
  },
  actions: {},
});

export type Catalog = typeof catalog;

/** Infers a component's props type straight from its Zod schema in the catalog above. */
export type CatalogComponentProps<K extends keyof (typeof catalog)['data']['components']> = z.infer<
  (typeof catalog)['data']['components'][K]['props']
>;
