import { publishPathReviewFixture } from '@/catalog/fixtures/publish-path-review';
import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';

export const publishPathReviewDemo: LibraryDemo = {
  slug: 'publish-path-review',
  title: 'Publish path review',
  description:
    'Diagrams inside a real document: a design review whose flowchart, state machine, sequence and pie are drawn by the in-repo engine, plus a rollout gantt that falls back to mermaid.js — rendered exactly as the published spec would be.',
  group: 'Examples',
  render: () => <SpecView spec={publishPathReviewFixture} />,
};
