import { catalogDemo } from '@/components/library/catalog-demo';

/*
 * Both engines behind the block, side by side in one control. The first three headers detect into
 * the house engine and draw inline; `gantt` is a family mermaid.js renders and the house engine
 * does not, so it is the honest picture of the fallback; `mindmap` is outside mermaid's own
 * allowlist and lands on the source-with-a-reason shape that ends both paths.
 */
const samples = {
  'flowchart (house)': `flowchart TD
  publish[Claude publishes] --> validate{Spec valid?}
  validate -- yes --> store[(SQLite)]
  validate -- no --> reason[Errors back to Claude]
  store --> gallery[Gallery]`,
  'sequence (house)': `sequenceDiagram
  participant Claude
  participant MCP
  participant Gallery
  Claude->>MCP: publish_markdown
  MCP->>Gallery: store version
  Gallery-->>Claude: artifact url`,
  'pie (house)': `pie showData title Published blocks
  "Prose" : 48
  "Tables" : 26
  "Diagrams" : 17
  "Charts" : 9`,
  'gantt (stock mermaid)': `gantt
  title Release
  dateFormat YYYY-MM-DD
  section Build
  Catalog work :2026-01-05, 12d
  Review       :2026-01-17, 5d`,
  'rejected (mindmap)': `mindmap
  root((exhibit))
    specs
    markdown`,
} as const;

const kinds = Object.keys(samples) as (keyof typeof samples)[];

export const catalogMermaidDemo = catalogDemo({
  slug: 'catalog-mermaid',
  title: 'Mermaid',
  description:
    'Mermaid diagram source: flowchart, sequence, state and pie draw in the house engine; other diagram types go to mermaid.js inside a script-less sandboxed frame, and unsupported ones degrade to their source with a reason.',
  controls: {
    sample: { kind: 'select', label: 'Sample', options: kinds, defaultValue: 'flowchart (house)' },
  },
  element: (values) => ({ type: 'Mermaid', props: { code: samples[values.sample] } }),
});
