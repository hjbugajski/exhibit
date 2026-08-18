import { describe, expect, it } from 'vitest';

import { defaultLimits } from '../../build.ts';
import { Reporter } from '../../core/diagnostics.ts';
import type { GraphModel } from '../../core/graph/model.ts';
import type { ErIR } from './ir.ts';
import { parseEr } from './parse.ts';
import { toGraph } from './to-graph.ts';

function graph(source: string): GraphModel {
  const parsed = parseEr(source, { report: new Reporter(), limits: defaultLimits });

  return toGraph(parsed.ir as ErIR);
}

const header = 'erDiagram';

describe('toGraph', () => {
  it('draws every entity as one rectangle in declaration order', () => {
    const model = graph(`${header}\n  B ||--|| A : has\n  C`);

    expect(model.nodes.map((node) => [node.id, node.shape])).toEqual([
      ['B', 'rect'],
      ['A', 'rect'],
      ['C', 'rect'],
    ]);
    expect(model.clusters).toEqual([]);
  });

  it('labels an entity with its id, or with the display name it was given', () => {
    const model = graph(`${header}\n  CUSTOMER\n  p[Person]\n  "Customer Account"`);

    expect(model.nodes.map((node) => node.label)).toEqual([
      ['CUSTOMER'],
      ['Person'],
      ['Customer Account'],
    ]);
  });

  it('stacks the attribute rows under the entity name', () => {
    const model = graph(
      `${header}\n  CUSTOMER {\n    string name PK "the name"\n    string other FK, UK\n    int age\n  }`,
    );

    expect(model.nodes[0]?.label).toEqual([
      'CUSTOMER',
      'string name PK "the name"',
      'string other FK,UK',
      'int age',
    ]);
  });

  it('records both cardinalities as classes and neither end as an arrowhead', () => {
    const model = graph(`${header}\n  A }o--|{ B : has`);

    expect(model.edges[0]).toMatchObject({
      source: 'A',
      target: 'B',
      label: ['has'],
      line: 'solid',
      arrow: 'none',
      startArrow: 'none',
      classes: ['er-source-zero-or-more', 'er-target-one-or-more'],
      minLen: 1,
      weight: 1,
    });
  });

  it('draws a non-identifying relationship as a dotted line', () => {
    const model = graph(`${header}\n  A ||..|| B : has`);

    expect(model.edges[0]).toMatchObject({ line: 'dotted' });
  });

  it('leaves an unlabelled relationship without a label', () => {
    const model = graph(`${header}\n  A ||--|| B : ""`);

    expect(model.edges[0]?.label).toBeUndefined();
  });

  it('carries family, direction and accessibility text', () => {
    const model = graph(
      `${header}\n  accTitle: Orders\n  accDescr: Who buys what\n  A ||--|| B : has`,
    );

    expect(model).toMatchObject({
      family: 'er',
      direction: 'TB',
      title: 'Orders',
      description: 'Who buys what',
    });
  });

  it('carries no colour-valued string into the model', () => {
    const model = graph(`${header}\n  A ||--o{ B : has\n  A {\n    string name PK\n  }`);

    expect(JSON.stringify(model)).not.toMatch(/#[\da-f]{3,8}\b|oklch|rgb\(|var\(--/i);
  });
});
