import { catalogDemo } from '@/components/library/catalog-demo';

/*
 * Every family the block draws, side by side in one control. All but the last detect into the house
 * engine and draw inline; `mindmap` is recognized but not drawn yet, so it lands on the
 * source-with-a-reason shape every undrawable source ends on.
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
  'class (house)': `classDiagram
  class Artifact {
    +String slug
    +String title
    +publish() Version
  }
  class Version {
    +int number
    +String body
  }
  Artifact "1" *-- "many" Version : keeps`,
  'er (house)': `erDiagram
  ARTIFACT ||--o{ VERSION : keeps
  ARTIFACT }o--o{ TAG : "filed under"
  VERSION {
    int number PK
    string body
  }`,
  'gantt (house)': `gantt
  title Release
  dateFormat YYYY-MM-DD
  section Build
  Catalog work :2026-01-05, 12d
  Review       :2026-01-17, 5d`,
  'mindmap (unsupported → source)': `mindmap
  root((exhibit))
    specs
    markdown`,
} as const;

const kinds = Object.keys(samples) as (keyof typeof samples)[];

export const catalogMermaidDemo = catalogDemo({
  slug: 'catalog-mermaid',
  title: 'Mermaid',
  description:
    'Mermaid diagram source: flowchart, sequence, state, class, ER, pie and gantt draw in the house engine; every other diagram type keeps its source on screen with the reason it was not drawn.',
  controls: {
    sample: { kind: 'select', label: 'Sample', options: kinds, defaultValue: 'flowchart (house)' },
  },
  element: (values) => ({ type: 'Mermaid', props: { code: samples[values.sample] } }),
});
