import { catalogDemo } from '@/components/library/catalog-demo';

const samples = {
  flowchart: `flowchart TD
  publish[Claude publishes] --> validate{Spec valid?}
  validate -- yes --> store[(SQLite)]
  validate -- no --> reason[Errors back to Claude]
  store --> gallery[Gallery]`,
  sequence: `sequenceDiagram
  participant Claude
  participant MCP
  participant Gallery
  Claude->>MCP: publish_markdown
  MCP->>Gallery: store version
  Gallery-->>Claude: artifact url`,
  // Deliberately outside the allowlist: the block shows its source plus the one-line reason.
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
    'Mermaid diagram source drawn inside a script-less sandboxed frame; unsupported diagram types degrade to their source with a reason.',
  controls: {
    sample: { kind: 'select', label: 'Sample', options: kinds, defaultValue: 'flowchart' },
  },
  element: (values) => ({ type: 'Mermaid', props: { code: samples[values.sample] } }),
});
