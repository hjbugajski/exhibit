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
 * hitting React/the chart engine/the markdown renderer — a real browser-DoS vector for the owner viewing
 * rendered artifacts. SHORT_MAX covers titles/labels/short strings, LONG_MAX long-form
 * markdown/prose/code; a few array fields use their own bound where that's obviously right
 * (documented inline).
 */

import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { z } from 'zod';

import { ALLOWED_FAMILIES, MERMAID_MAX_CHARS } from '@/catalog/mermaid-schema';
import {
  FORECAST_DAYS_MAX,
  LIVE_WEATHER_MAX,
  weatherConditions,
} from '@/components/catalog/weather-schema';

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

/**
 * Marker cap for a single map. Shared by Map's own schema, Trail's waypoints, the per-Day and
 * per-Itinerary lints in validate.ts, and the render guards of the day map (day.tsx) and the trip
 * map (itinerary.tsx) so they can't drift.
 */
export const MAP_MARKERS_MAX = 500;
const listItemId = z
  .string()
  .min(1)
  .max(SHORT_MAX)
  .describe('Unique id for this item within the list; stable across versions.');
/** A labeled map pin, shared by Map markers and Trail waypoints. */
const mapMarker = latLng.extend({
  id: listItemId,
  label: z.string().max(SHORT_MAX).describe('Short label shown next to the marker.'),
  description: z
    .string()
    .max(SHORT_MAX)
    .optional()
    .describe('Detail shown in a popup when the marker is clicked.'),
});
/** An ordered line of points, shared by Map paths and Trail tracks. */
const trackPoints = z.array(latLng).min(2).max(500);

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
        'Grid of children with consistent spacing. 1 column is the default vertical-flow container; 2 to 4 columns suit cards or short items that compare well side by side.',
      props: z.object({
        columns: columns.describe(
          'Number of columns at desktop width. Always collapses to 1 column on small screens.',
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
        'Tabbed container: one label per child, and child i renders under items[i]. Use for alternate views of one topic, such as two proposals or before and after. Give each tab exactly one child; use a 1-column Grid to group multiple blocks.',
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
        'Horizontal separator line between blocks. Use sparingly; block spacing usually suffices.',
      props: z.object({}),
    },

    // Typography
    Heading: {
      description:
        'Standalone heading, independent of Section titles. Use sparingly; prefer Section title and subtitle for structure.',
      props: z.object({
        level: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .describe(
            'Size: 1 largest, 3 smallest. The artifact title is already the page heading; do not repeat it.',
          ),
        text: z.string().min(1).max(SHORT_MAX).describe('The heading text.'),
      }),
    },
    Prose: {
      description:
        'Markdown body text for paragraphs, lists, links, bold, italic, and blockquotes. Use for any free-form writing.',
      props: z.object({
        markdown: z
          .string()
          .max(LONG_MAX)
          .describe(
            'CommonMark and GFM source. Raw HTML shows as literal text; only http(s) links render.',
          ),
      }),
    },
    Callout: {
      description:
        'Boxed aside that draws attention to a tip, warning, success note, or side note. Use sparingly: one or two per section, not for every paragraph.',
      props: z.object({
        variant: z
          .enum(['default', 'info', 'success', 'warning', 'danger'])
          .describe(
            'Tone: default (aside, least urgent), info (neutral tip), success (good news or confirmation), warning (caution), danger (problem or blocker).',
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
        'Block quotation, optionally attributed. Use for a notable quote from a source, guide, or person, not for emphasis on your own writing.',
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
          .describe('Language name shown in the header, such as "ts".'),
        filename: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('File name shown in the header, such as "vite.config.ts".'),
      }),
    },

    // Structure
    Card: {
      slots: ['default'],
      description:
        'Bordered container for a self-contained chunk of content. Pair with Grid for a set of comparable cards. With `value`, it doubles as a key metric: label, big value, and optional delta with trend arrow. Put several in a Grid for a metrics row.',
      props: z
        .object({
          title: z.string().max(SHORT_MAX).optional().describe('Card heading.'),
          subtitle: z.string().max(SHORT_MAX).optional().describe('Muted line under the title.'),
          badge: z
            .string()
            .max(SHORT_MAX)
            .optional()
            .describe('Short label shown in the corner, such as a price or status.'),
          value: z
            .string()
            .max(SHORT_MAX)
            .optional()
            .describe('Headline metric value, preformatted, such as "$48.2k".'),
          delta: z
            .string()
            .max(SHORT_MAX)
            .optional()
            .describe(
              'Change from a prior period, preformatted, such as "+12% vs Q1". Needs `value`.',
            ),
          trend: z
            .enum(['up', 'down', 'flat'])
            .optional()
            .describe(
              'Arrow and color for the delta: up (green), down (red), flat (muted). Pick by desirability, not only sign. Defaults to flat.',
            ),
        })
        .refine((props) => props.value !== undefined || (!props.delta && !props.trend), {
          message: '`delta` and `trend` require `value`.',
          path: ['value'],
        }),
    },
    Table: {
      description:
        'Data table for structured rows and columns. Cell values are plain strings or { text, href } links, never markdown. Use for facts and figures, not for prose.',
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
          .array(
            z.record(
              z.string().max(SHORT_MAX),
              z.union([
                z.string().max(SHORT_MAX),
                z.object({
                  text: z.string().max(SHORT_MAX).describe('Cell text, shown as the link.'),
                  href: z
                    .string()
                    .max(2_000)
                    // Same rule as markdown links (see markdown-body.tsx): http(s) only.
                    .regex(/^https?:\/\//i, 'must be an http(s) URL')
                    .describe('Absolute http(s) URL the cell links to.'),
                }),
              ]),
            ),
          )
          // Generous for real data dumps, well short of a rendering hazard.
          .max(2_000)
          .describe(
            'Row data; each row maps column key to a plain string, or { text, href } to render the cell as a link.',
          ),
      }),
    },
    KeyValueList: {
      description:
        'Compact list of label and value pairs, like a spec sheet. Use for facts that do not need a full table, such as price, duration, and dates.',
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
          .describe('Ordered label and value pairs.'),
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
          .describe('Ordered steps, numbered from 1.'),
      }),
    },
    Timeline: {
      description:
        'Chronological sequence of dated or timed entries. Use for a history, schedule, or sequence of events. For step-by-step instructions, use Steps.',
      props: z.object({
        items: z
          .array(
            z.object({
              id: listItemId,
              label: z
                .string()
                .max(SHORT_MAX)
                .describe('Date or time string for this entry, such as "9:00 AM" or "March 2024".'),
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
        'Checklist of items. An item with a statePath is interactive: the owner toggles it in the browser, the state persists, and get_artifact reads it back. Omit statePath for display-only items.',
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
                  'Whether the item starts checked; defaults to unchecked. For a stateful item, this is only the default; saved state wins.',
                ),
              statePath: statePath
                .optional()
                .describe(
                  'JSON Pointer under which the checked state is stored, such as "/tasks/order-cabinets". A statePath makes the item interactive and persisted. Keep paths stable across versions.',
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
        'Small inline label for a status or tag, such as "Best value" or "Sold out". Use inline within Card badges and titles or KeyValueList values, not as a standalone block.',
      props: z.object({
        text: z.string().min(1).max(SHORT_MAX).describe('Badge text of one or two words.'),
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
        'Image with an optional caption. The URL must be https and publicly reachable. The image is lazy-loaded and requested without a referrer.',
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
        'Horizontal progress bar with an optional label and a percentage readout. Use for completion or capacity, as a value from 0 to 100.',
      props: z.object({
        label: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('What the bar measures, such as "Demo phase".'),
        value: z.number().min(0).max(100).describe('Percent complete, 0 to 100.'),
      }),
    },
    Chart: {
      description:
        'Single-series chart over categories or time: about 4 to 24 points, or 4 to 6 donut slices. Use Table for exact values.',
      props: z.object({
        kind: z
          .enum(['bar', 'line', 'area', 'scatter', 'donut'])
          .describe('bar or scatter for categories, line or area for trends, donut for shares.'),
        data: z
          .array(
            z.object({
              label: z.string().max(SHORT_MAX).describe('Category, time, or slice label.'),
              value: z.number().describe('Numeric value.'),
            }),
          )
          .min(2)
          // Every point becomes an SVG primitive; 5k is generous for a real series and well short
          // of a rendering hazard.
          .max(5_000)
          .describe('Ordered, left to right.'),
        valueLabel: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Series name in the tooltip, such as "Cost ($)".'),
      }),
    },

    Mermaid: {
      description: `Diagram from mermaid source without a code fence. Draws ${ALLOWED_FAMILIES}; other types show the source with the reason.`,
      props: z.object({
        code: z.string().min(1).max(MERMAID_MAX_CHARS),
      }),
    },

    Map: {
      description:
        'Interactive street map with labeled markers and optional route paths. The view fits the data automatically; pass center and zoom only for a plain map with no markers or paths.',
      props: z.object({
        center: latLng
          .optional()
          .describe('Initial center; usually omit it so the markers and paths fit the view.'),
        zoom: z
          .number()
          .min(1)
          .max(18)
          .optional()
          .describe('Initial zoom level, from 1 (world) to 18 (street); usually omit.'),
        markers: z
          .array(mapMarker)
          .max(MAP_MARKERS_MAX)
          .check(uniqueIds)
          .optional()
          .describe('Points of interest to pin on the map.'),
        paths: z
          .array(
            z.object({
              id: listItemId,
              points: trackPoints.describe('Waypoints of the path, in order.'),
              dashed: z
                .boolean()
                .optional()
                .describe('Render the path dashed, such as for a planned or alternate leg.'),
            }),
          )
          .max(500)
          .check(uniqueIds)
          .optional()
          .describe('Routes drawn as straight lines between waypoints, not following roads.'),
      }),
    },

    // Interactive
    Choice: {
      description:
        'Single-select question the owner answers in the browser. The chosen option id persists at statePath, and get_artifact reads it back. Use to ask the owner to pick between options, such as designs, plans, or variants.',
      props: z.object({
        label: z
          .string()
          .max(SHORT_MAX)
          .describe('The question or prompt, such as "Which direction should I take?"'),
        options: z
          .array(
            z.object({
              id: listItemId.describe(
                'Unique id for this option within the list. The selection stores this exact string. Keep it stable across versions.',
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
          'JSON Pointer where the selected option id is stored, such as "/decisions/logo-direction". Keep paths stable across versions.',
        ),
      }),
    },
    NoteBox: {
      description:
        'Free-form text box the owner types into. The text persists at statePath, and get_artifact reads it back. Use to collect feedback or an answer to an open question.',
      props: z.object({
        label: z
          .string()
          .max(SHORT_MAX)
          .describe('What you are asking for, such as "Anything to change?"'),
        placeholder: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Hint text shown while the box is empty.'),
        statePath: statePath.describe(
          'JSON Pointer where the text is stored, such as "/feedback/homepage". Keep paths stable across versions.',
        ),
      }),
    },
    Rating: {
      description:
        'Five-star rating the owner sets in the browser. The number, 1 to 5, persists at statePath, and get_artifact reads it back. Use to ask the owner to score an option or result.',
      props: z.object({
        label: z.string().max(SHORT_MAX).describe('What is being rated, such as "Draft 2".'),
        statePath: statePath.describe(
          'JSON Pointer where the rating number is stored, such as "/ratings/draft-2". Keep paths stable across versions.',
        ),
      }),
    },

    // Travel
    Itinerary: {
      slots: ['default'],
      description:
        'Top-level container for a trip; children are Day elements. Adds a trip map and links to each day automatically.',
      props: z.object({
        title: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Itinerary title, such as "Kyoto in Five Days".'),
        dateRange: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Human-readable date range, such as "May 3 to 8, 2026".'),
      }),
    },
    Day: {
      slots: ['default'],
      description:
        'One day in an Itinerary. Children are Stops, optionally mixed with other blocks such as Weather, Trail, or Figure. Stops with coordinates appear on an automatic day map, numbered in order; do not add a Map for them.',
      props: z.object({
        label: z.string().max(SHORT_MAX).describe('Day label, such as "Day 1: Sunday".'),
        date: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Calendar date for this day, such as "May 3, 2026".'),
        summary: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('One-line summary of the day, shown under the label.'),
      }),
    },
    Stop: {
      description: 'One stop in a Day: a meal, activity, stay, or travel leg.',
      props: z.object({
        time: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('Clock time for this stop, such as "9:30 AM".'),
        duration: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('How long this stop takes, such as "1.5 hours".'),
        title: z
          .string()
          .max(SHORT_MAX)
          .describe('Name of the stop, such as "Fushimi Inari Shrine".'),
        location: z.string().max(SHORT_MAX).optional().describe('Neighborhood, address, or area.'),
        coordinates: latLng.optional().describe('Pins the stop on the day and trip maps.'),
        markdown: z
          .string()
          .max(LONG_MAX)
          .optional()
          .describe('Markdown detail: what to do, tips, booking info.'),
        kind: z
          .enum(['food', 'activity', 'lodging', 'travel', 'hike', 'shopping', 'other'])
          .optional()
          .describe('Sets the icon. Defaults to other.'),
        url: z
          .string()
          .max(2_000)
          // Same rule as Table links: http(s) only.
          .regex(/^https?:\/\//i, 'must be an http(s) URL')
          .optional()
          .describe('Booking or info link; the title links to it.'),
        cost: z.string().max(SHORT_MAX).optional().describe('Price as shown, such as "¥500".'),
        status: z.enum(['booked', 'planned', 'optional']).optional(),
        transit: z
          .object({
            mode: z.enum(['walk', 'transit', 'drive', 'bike', 'flight', 'boat']),
            duration: z.string().max(SHORT_MAX).optional(),
          })
          .optional()
          .describe('Travel from the previous stop to this one.'),
      }),
    },
    Trail: {
      description:
        'One hike with its stats, an optional track map, and an optional elevation profile. Use Trail rather than Stop to detail a hike, including inside a Day. Trail draws its own map, and its points never join the Day map.',
      props: z.object({
        name: z.string().max(SHORT_MAX),
        distance: z.object({ value: z.number().positive(), unit: z.enum(['km', 'mi']) }),
        elevationGain: z.object({ value: z.number().min(0), unit: z.enum(['m', 'ft']) }),
        difficulty: z.enum(['easy', 'moderate', 'hard', 'strenuous']),
        routeType: z.enum(['loop', 'out-and-back', 'point-to-point']),
        duration: z
          .string()
          .max(SHORT_MAX)
          .optional()
          .describe('How long the hike takes, such as "3 hours".'),
        track: trackPoints.optional().describe('The trail line, start to finish.'),
        waypoints: z
          .array(mapMarker)
          .max(MAP_MARKERS_MAX)
          .check(uniqueIds)
          .optional()
          .describe('Pins along the trail; put the trailhead first.'),
        elevationProfile: z
          .array(z.number())
          .min(2)
          .max(500)
          .optional()
          .describe('Elevations in elevationGain.unit, sampled evenly from start to finish.'),
        markdown: z
          .string()
          .max(LONG_MAX)
          .optional()
          .describe('Markdown notes: access, permits, water, hazards.'),
      }),
    },
    Weather: {
      // Field descriptions inside a union never reach get_catalog, so this description carries the
      // semantics of both branches.
      description: `Daily forecast strip covering 1 to 7 days. With source "static", you pass the days: date as displayed, high and low in unit, precipitationChance as a percentage. With source "live", the app fetches a forecast for location each time the artifact is viewed; use it for trips within the next week. At most ${LIVE_WEATHER_MAX} live blocks per artifact.`,
      props: z.discriminatedUnion('source', [
        z.object({
          source: z.literal('static'),
          unit: z.enum(['c', 'f']),
          label: z.string().max(SHORT_MAX).optional(),
          summary: z.string().max(SHORT_MAX).optional(),
          days: z
            .array(
              z.object({
                date: z.string().max(SHORT_MAX),
                high: z.number(),
                low: z.number(),
                condition: z.enum(weatherConditions),
                precipitationChance: z.number().int().min(0).max(100).optional(),
              }),
            )
            .min(1)
            .max(FORECAST_DAYS_MAX)
            .check(
              uniqueBy(
                (day: { date?: unknown } | null | undefined) => day?.date,
                (date) => `Date "${date}" is used more than once; each day needs its own date.`,
              ),
            ),
        }),
        z.object({
          source: z.literal('live'),
          location: latLng,
          label: z.string().max(SHORT_MAX).optional(),
          unit: z.enum(['c', 'f']).optional(),
          dayCount: z.number().int().min(1).max(FORECAST_DAYS_MAX).optional(),
        }),
      ]),
    },
  },
  actions: {},
});

export type Catalog = typeof catalog;

/** Infers a component's props type straight from its Zod schema in the catalog above. */
export type CatalogComponentProps<K extends keyof (typeof catalog)['data']['components']> = z.infer<
  (typeof catalog)['data']['components'][K]['props']
>;
