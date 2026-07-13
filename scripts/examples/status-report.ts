import type { Spec } from '@json-render/core';

/**
 * Uses Timeline/Steps/Progress/Chart(line)/Callout: a project status report tracking this repo's
 * own recent history — the kind of self-referential artifact a Claude coding session actually
 * produces at a milestone.
 */
const spec: Spec = {
  root: 'root',
  elements: {
    root: {
      type: 'Section',
      props: {
        title: 'Exhibit — Phase 5 Status Report',
        subtitle: 'Week of July 5, 2026',
      },
      children: [
        'summary',
        'stat-grid',
        'progress',
        'chart-heading',
        'chart',
        'risk',
        'timeline-heading',
        'timeline',
        'steps-heading',
        'steps',
      ],
    },
    summary: {
      type: 'Prose',
      props: {
        markdown:
          'Phase 5 (MCP hardening + perf) is in its last stretch. This week closed out the security review findings (opaque token hashing, global security headers), landed the breaking change requiring unique ids on every catalog list item, and shipped a route-splitting pass that noticeably shrank the main chunk. Structured request logging (evlog) went in last, ahead of the seed-data pass.',
      },
      children: [],
    },
    'stat-grid': {
      type: 'Grid',
      props: { columns: 3 },
      children: ['stat-commits', 'stat-bundle', 'stat-findings'],
    },
    'stat-commits': {
      type: 'Card',
      props: { title: 'Commits this week', value: '6', delta: '3 fix, 2 feat, 1 perf' },
      children: [],
    },
    'stat-bundle': {
      type: 'Card',
      props: {
        title: 'Main route chunk',
        value: '142 KB',
        delta: '-38% after chart lazy-load',
        trend: 'up',
      },
      children: [],
    },
    'stat-findings': {
      type: 'Card',
      props: { title: 'Security findings closed', value: '2', delta: 'token hashing, headers' },
      children: [],
    },
    progress: {
      type: 'Progress',
      props: { label: 'Phase 5 completion', value: 85 },
      children: [],
    },
    'chart-heading': {
      type: 'Heading',
      props: { level: 2, text: 'Main Chunk Size, Last 4 Builds' },
      children: [],
    },
    chart: {
      type: 'Chart',
      props: {
        kind: 'line',
        valueLabel: 'Size (KB)',
        data: [
          { label: 'Jul 3', value: 231 },
          { label: 'Jul 4', value: 228 },
          { label: 'Jul 5 AM', value: 229 },
          { label: 'Jul 5 PM', value: 142 },
        ],
      },
      children: [],
    },
    risk: {
      type: 'Callout',
      props: {
        variant: 'warning',
        title: 'Seed data still lost on every DB reset',
        markdown:
          'The example artifacts the owner uses to sanity-check the gallery live only in a running dev DB — a reset wipes them and they have to be re-typed from memory. Tracked as the last item before Phase 5 closes.',
      },
      children: [],
    },
    'timeline-heading': {
      type: 'Heading',
      props: { level: 2, text: 'Completed This Week' },
      children: [],
    },
    timeline: {
      type: 'Timeline',
      props: {
        items: [
          {
            id: 'security-headers',
            label: 'Jul 5',
            title: 'Hash opaque MCP tokens before lookup; add global security headers',
          },
          {
            id: 'choice-labels',
            label: 'Jul 5',
            title: 'Reject duplicate Choice labels, surface copy errors',
          },
          {
            id: 'unique-ids',
            label: 'Jul 5',
            title: 'Require unique ids on catalog list items',
            markdown: 'Breaking change — Choice now stores the selected option id, not the label.',
          },
          {
            id: 'perf-pass',
            label: 'Jul 5',
            title: 'Split route bundles, lazy-load chart, add artifact indexes',
          },
          {
            id: 'evlog',
            label: 'Jul 5',
            title: 'Adopt evlog for server-side request logging',
          },
        ],
      },
      children: [],
    },
    'steps-heading': {
      type: 'Heading',
      props: { level: 2, text: 'Left Before Phase 5 Closes' },
      children: [],
    },
    steps: {
      type: 'Steps',
      props: {
        items: [
          {
            id: 'reseed-examples',
            title: 'Rebuild the seed example set in code',
            markdown:
              'Rich, id-complete specs covering every catalog component, published by scripts/dev-publish.ts.',
          },
          {
            id: 'verify-migrations',
            title: 'Re-run drizzle-kit generate against a clean checkout',
          },
          { id: 'tag-release', title: 'Tag v0.5.0 once the gate is green on main' },
        ],
      },
      children: [],
    },
  },
};

export const statusReportExample = {
  title: 'Exhibit — Phase 5 Status Report',
  description: "Weekly status report tracking this repo's own Phase 5 progress toward release.",
  tags: ['status', 'engineering', 'demo'],
  spec,
};
