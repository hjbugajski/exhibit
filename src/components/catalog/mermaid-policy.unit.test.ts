// @vitest-environment happy-dom
import mermaid from 'mermaid';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  buildDiagramDocument,
  DIAGRAM_TYPE_LABELS,
  parseDiagramAspectRatio,
  sanitizeDiagramSvg,
} from '@/components/catalog/mermaid-policy';

/**
 * DOMPurify needs a browser-accurate `nodeName` before it loads (see the helper). The gaps that
 * survive the patch keep the cases below narrow: nothing here can assert the diagram keeps its
 * styling, and foreignObject gets its own case rather than sharing one.
 */
await vi.hoisted(async () => {
  const { patchNodeName } = await import('@testing/happy-dom-node-name');

  patchNodeName();
});

/** One sample per allowed family, plus the shorthand spellings that detect as a different id. */
const samples: Record<string, string> = {
  flowchart: 'flowchart TD\n  A[Start] --> B[End]',
  graph: 'graph LR\n  A --> B',
  sequence: 'sequenceDiagram\n  Alice->>Bob: Hi',
  class: 'classDiagram\n  class Animal',
  'class-v2': 'classDiagram-v2\n  class Animal',
  state: 'stateDiagram\n  [*] --> Idle',
  'state-v2': 'stateDiagram-v2\n  [*] --> Idle',
  er: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places',
  gantt: 'gantt\n  title A\n  section S\n  Task :a1, 2024-01-01, 3d',
  pie: 'pie title Pets\n  "Dogs" : 3',
  journey: 'journey\n  title My day\n  section Go\n    Work: 5: Me',
  gitGraph: 'gitGraph\n  commit',
};

/** Popular but deliberately excluded: newer code paths are the residual risk here. */
const rejected: Record<string, string> = {
  architecture: 'architecture-beta\n  group api(cloud)[API]',
  mindmap: 'mindmap\n  root((x))',
  timeline: 'timeline\n  title T\n  2021 : a',
  quadrant: 'quadrantChart\n  title Q\n  x-axis Low --> High',
};

describe('diagram type allowlist', () => {
  // detectType only knows the types initialize() registered.
  beforeAll(() => {
    mermaid.initialize({ startOnLoad: false });
  });

  it.each(Object.entries(samples))('allows the %s sample', (_name, code) => {
    expect(DIAGRAM_TYPE_LABELS.has(mermaid.detectType(code))).toBe(true);
  });

  it.each(Object.entries(rejected))('rejects the %s sample', (_name, code) => {
    expect(DIAGRAM_TYPE_LABELS.has(mermaid.detectType(code))).toBe(false);
  });

  it('pins the ids the samples actually detect as', () => {
    expect(
      [...new Set(Object.values(samples).map((code) => mermaid.detectType(code)))].sort(),
    ).toEqual([
      'class',
      'classDiagram',
      'er',
      'flowchart',
      'flowchart-v2',
      'gantt',
      'gitGraph',
      'journey',
      'pie',
      'sequence',
      'state',
      'stateDiagram',
    ]);
  });

  it('allowlists no id the samples do not cover', () => {
    const detected = new Set(Object.values(samples).map((code) => mermaid.detectType(code)));

    expect([...DIAGRAM_TYPE_LABELS.keys()].filter((id) => !detected.has(id))).toEqual([]);
  });
});

describe('sanitizeDiagramSvg', () => {
  it('drops scripts and event handlers while keeping the diagram', () => {
    const clean = sanitizeDiagramSvg(
      '<svg viewBox="0 0 10 5"><g><text x="1" onclick="alert(1)">Label</text></g>' +
        '<path d="M0 0" onload="alert(2)"/><script>alert(3)</script></svg>',
    );

    expect(clean).toContain('<path d="M0 0"');
    expect(clean).toContain('<text x="1">Label</text>');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onload');
  });

  // Which is why mermaid runs with htmlLabels off: HTML labels would be sanitized away.
  it('drops foreignObject and its HTML payload', () => {
    const clean = sanitizeDiagramSvg(
      '<svg viewBox="0 0 10 5"><foreignObject><div>html label</div></foreignObject></svg>',
    );

    expect(clean).not.toContain('foreignObject');
    expect(clean).not.toContain('html label');
  });

  it('throws when nothing survives sanitizing', () => {
    expect(() => sanitizeDiagramSvg('<script>alert(1)</script>')).toThrow();
  });
});

describe('buildDiagramDocument', () => {
  it('locks the frame down with a meta CSP and embeds the diagram', () => {
    const doc = buildDiagramDocument('<svg viewBox="0 0 10 5"></svg>', '#131518');

    expect(doc).toContain(
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">',
    );
    expect(doc).toContain('<svg viewBox="0 0 10 5"></svg>');
    expect(doc).toContain('background:#131518');
  });
});

describe('parseDiagramAspectRatio', () => {
  it('prefers the viewBox', () => {
    expect(parseDiagramAspectRatio('<svg width="100%" viewBox="0 0 200 100"></svg>')).toBe(2);
  });

  it('falls back to pixel dimensions', () => {
    expect(parseDiagramAspectRatio('<svg width="300px" height="100px"></svg>')).toBe(3);
  });

  it('is null without usable dimensions', () => {
    expect(parseDiagramAspectRatio('<svg width="100%"></svg>')).toBeNull();
  });
});
