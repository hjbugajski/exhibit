import type { Spec } from '@json-render/core';

/**
 * Stress-tests the prose-flow margin system: a 1-column Grid root (the catalog's default vertical
 * flow container) with blocks first, last, and adjacent in every rhythm-sensitive combination —
 * heading→prose, prose→table, card edges, nested flow inside Card/Tabs/Section, cell-wrapped
 * multi-column Grid, and an Itinerary. The spec opens and closes with plain blocks so the
 * first/last margin resets are visible at the root.
 */
export const flowFixture: Spec = {
  root: 'root',
  elements: {
    root: {
      type: 'Grid',
      props: { columns: 1 },
      children: [
        'opening-prose',
        'title',
        'intro',
        'metrics',
        'code-heading',
        'code',
        'quote',
        'divider',
        'report-section',
        'checks-section',
        'tabs',
        'nested-card',
        'steps',
        'timeline',
        'feedback',
        'trip',
        'closing-prose',
      ],
    },
    'opening-prose': {
      type: 'Prose',
      props: {
        markdown:
          'This spec starts with plain prose, so the first block must sit flush at the top. Every pair of neighbors below exercises a different margin-collapse case.',
      },
      children: [],
    },
    title: { type: 'Heading', props: { level: 1, text: 'Flow stress test' }, children: [] },
    intro: {
      type: 'Prose',
      props: {
        markdown:
          'A heading followed by prose should read tighter than two stacked cards. **Bold**, *italics*, and a [link](https://example.com) confirm markdown rhythm too.\n\nA second paragraph checks intra-prose spacing against inter-block spacing.',
      },
      children: [],
    },
    metrics: { type: 'Grid', props: { columns: 2 }, children: ['metric-a', 'metric-b'] },
    'metric-a': {
      type: 'Card',
      props: { title: 'Revenue', value: '$128k', delta: '+12%', trend: 'up' },
      children: [],
    },
    'metric-b': {
      type: 'Card',
      props: { title: 'Card ending in table' },
      children: ['metric-b-prose', 'metric-b-table'],
    },
    'metric-b-prose': {
      type: 'Prose',
      props: { markdown: 'Card content starts with prose and ends with a table — both flush.' },
      children: [],
    },
    'metric-b-table': {
      type: 'Table',
      props: {
        columns: [
          { key: 'k', label: 'Key' },
          { key: 'v', label: 'Value', align: 'right' },
        ],
        rows: [
          { k: 'Rows', v: '2' },
          { k: 'Edges', v: 'flush' },
        ],
      },
      children: [],
    },
    'code-heading': {
      type: 'Heading',
      props: { level: 2, text: 'Code after a heading' },
      children: [],
    },
    code: {
      type: 'CodeBlock',
      props: { language: 'ts', code: "export const rhythm = 'margins, not gaps';" },
      children: [],
    },
    quote: {
      type: 'Quote',
      props: { markdown: 'Spacing is invisible until it is wrong.', attribution: 'Every reviewer' },
      children: [],
    },
    divider: { type: 'Divider', props: {}, children: [] },
    'report-section': {
      type: 'Section',
      props: {
        title: 'Section with header',
        subtitle: 'Body offset from the header, blocks collapse inside',
      },
      children: ['report-prose', 'report-kv', 'report-details'],
    },
    'report-prose': {
      type: 'Prose',
      props: { markdown: 'First block in a Section body sits flush under the header offset.' },
      children: [],
    },
    'report-kv': {
      type: 'KeyValueList',
      props: {
        columns: 2,
        items: [
          { id: 'owner', key: 'Owner', value: 'Henry' },
          { id: 'status', key: 'Status', value: 'In review' },
          { id: 'blocks', key: 'Blocks', value: '17' },
        ],
      },
      children: [],
    },
    'report-details': {
      type: 'Details',
      props: {
        summary: 'Why margins instead of gaps?',
        markdown:
          'Collapsing margins let a heading hug its paragraph while cards keep their distance.',
      },
      children: [],
    },
    'checks-section': {
      type: 'Section',
      props: {},
      children: ['checks-heading', 'checks-list', 'checks-progress', 'checks-callout'],
    },
    'checks-heading': {
      type: 'Heading',
      props: { level: 3, text: 'Headerless section opening with a heading' },
      children: [],
    },
    'checks-list': {
      type: 'Checklist',
      props: {
        items: [
          { id: 'first', text: 'First block flush at every flow edge', checked: true },
          { id: 'between', text: 'Neighbors collapse to the larger margin' },
          { id: 'last', text: 'Last block flush before padding/borders' },
        ],
      },
      children: [],
    },
    'checks-progress': {
      type: 'Progress',
      props: { value: 64, label: 'Tuning pass' },
      children: [],
    },
    'checks-callout': {
      type: 'Callout',
      props: {
        variant: 'warning',
        title: 'Last in section',
        markdown: 'A Callout closes this section — no trailing margin.',
      },
      children: [],
    },
    tabs: {
      type: 'Tabs',
      props: { items: ['Mixed flow', 'Single block'] },
      children: ['tab-a', 'tab-b'],
    },
    'tab-a': { type: 'Grid', props: { columns: 1 }, children: ['tab-a-prose', 'tab-a-table'] },
    'tab-a-prose': {
      type: 'Prose',
      props: { markdown: 'A tab panel is a flow context too: prose then table.' },
      children: [],
    },
    'tab-a-table': {
      type: 'Table',
      props: {
        columns: [{ key: 'case', label: 'Case' }],
        rows: [{ case: 'Panel first/last resets' }],
      },
      children: [],
    },
    'tab-b': {
      type: 'Callout',
      props: { variant: 'info', markdown: 'A lone block fills the panel flush on both edges.' },
      children: [],
    },
    'nested-card': {
      type: 'Card',
      props: { title: 'Card with nested flow', badge: 'nested' },
      children: ['nested-grid'],
    },
    'nested-grid': {
      type: 'Grid',
      props: { columns: 1 },
      children: ['nested-heading', 'nested-prose', 'nested-columns'],
    },
    'nested-heading': {
      type: 'Heading',
      props: { level: 3, text: 'Flow inside a card' },
      children: [],
    },
    'nested-prose': {
      type: 'Prose',
      props: {
        markdown: 'The same rhythm applies inside a Card, ending with side-by-side columns.',
      },
      children: [],
    },
    'nested-columns': {
      type: 'Columns',
      props: { ratio: '2:1' },
      children: ['nested-col-quote', 'nested-col-badge'],
    },
    'nested-col-quote': {
      type: 'Quote',
      props: { markdown: 'Cell wrappers neutralize my margins.' },
      children: [],
    },
    'nested-col-badge': { type: 'Badge', props: { text: 'cell', variant: 'info' }, children: [] },
    steps: {
      type: 'Steps',
      props: {
        items: [
          {
            id: 'render',
            title: 'Render this fixture',
            markdown: 'Open it at `/dev/library/flow`.',
          },
          { id: 'squint', title: 'Squint at every seam' },
          { id: 'tune', title: 'Tune the scale in flow.ts' },
        ],
      },
      children: [],
    },
    timeline: {
      type: 'Timeline',
      props: {
        items: [
          {
            id: 'gaps',
            label: 'Before',
            title: 'Uniform grid gaps',
            markdown: 'Everything 16px apart.',
          },
          { id: 'margins', label: 'After', title: 'Collapsing margins', markdown: 'Prose rhythm.' },
        ],
      },
      children: [],
    },
    feedback: {
      type: 'Grid',
      props: { columns: 2 },
      children: ['feedback-rating', 'feedback-note'],
    },
    'feedback-rating': {
      type: 'Rating',
      props: { label: 'How does the rhythm feel?', statePath: '/flow/rating' },
      children: [],
    },
    'feedback-note': {
      type: 'NoteBox',
      props: {
        label: 'Seams that still look off',
        placeholder: 'e.g. heading → table',
        statePath: '/flow/notes',
      },
      children: [],
    },
    trip: {
      type: 'Itinerary',
      props: { title: 'Itinerary rhythm', dateRange: 'Two short days' },
      children: ['day-1', 'day-2'],
    },
    'day-1': {
      type: 'Day',
      props: { label: 'Day 1', date: 'Sat', summary: 'Stops flow with tight card margins.' },
      children: ['stop-1a', 'stop-1b'],
    },
    'stop-1a': {
      type: 'Stop',
      props: { title: 'Coffee', time: '9:00', kind: 'food', location: 'Corner café' },
      children: [],
    },
    'stop-1b': {
      type: 'Stop',
      props: { title: 'Walk the seams', time: '10:00', kind: 'activity' },
      children: [],
    },
    'day-2': {
      type: 'Day',
      props: { label: 'Day 2' },
      children: ['stop-2a'],
    },
    'stop-2a': {
      type: 'Stop',
      props: { title: 'Ship it', kind: 'other', markdown: 'A lone stop closes the day flush.' },
      children: [],
    },
    'closing-prose': {
      type: 'Prose',
      props: { markdown: 'The spec ends with prose — the last block sits flush at the bottom.' },
      children: [],
    },
  },
};
