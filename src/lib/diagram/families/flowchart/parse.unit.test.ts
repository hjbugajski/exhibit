/*
 * Table-driven parser coverage. Every case asserts the exact diagnostics it expects — an empty
 * `codes` means the source must parse silently — and snapshots a one-line-per-entity digest of the
 * IR, which is far easier to review in a diff than a nested object dump.
 */

import { describe, expect, it } from 'vitest';

import { defaultLimits } from '../../build.ts';
import { Reporter } from '../../core/diagnostics.ts';
import type { Diagnostic } from '../../types.ts';
import type { FlowchartIR } from './ir.ts';
import { parseFlowchart } from './parse.ts';

function parse(source: string): { ir: FlowchartIR | null; codes: string[] } {
  const report = new Reporter();
  const result = parseFlowchart(source, { report, limits: defaultLimits });

  return {
    ir: result.ir,
    codes: result.diagnostics.map((entry: Diagnostic) => `${entry.severity}:${entry.code}`),
  };
}

function digest(ir: FlowchartIR | null): string {
  if (!ir) {
    return '<no ir>';
  }

  const lines = [`direction ${ir.direction}`];

  for (const node of ir.nodes.values()) {
    const classes = node.classes.length > 0 ? ` :::${node.classes.join(',')}` : '';
    const cluster = node.cluster === null ? '' : ` in ${node.cluster}`;

    lines.push(
      `node ${node.id} ${node.shape} "${node.label.lines.join(' | ')}"${classes}${cluster}`,
    );
  }

  for (const edge of ir.edges) {
    const caps = `${edge.startArrow}/${edge.arrow}`;
    const label = edge.label ? ` "${edge.label.lines.join(' | ')}"` : '';
    const invisible = edge.invisible ? ' invisible' : '';

    lines.push(
      `edge ${edge.id} ${edge.from}->${edge.to} ${edge.line} ${caps} len=${edge.minLen}${label}${invisible}`,
    );
  }

  for (const cluster of ir.clusters) {
    const label = cluster.label ? ` "${cluster.label.lines.join(' | ')}"` : '';

    lines.push(`cluster ${cluster.id} parent=${cluster.parent}${label}`);
  }

  if (ir.classDefs.length > 0) {
    lines.push(`classDefs ${ir.classDefs.join(',')}`);
  }

  if (ir.accTitle !== undefined) {
    lines.push(`accTitle "${ir.accTitle}"`);
  }

  if (ir.accDescr !== undefined) {
    lines.push(`accDescr "${ir.accDescr}"`);
  }

  return lines.join('\n');
}

interface Case {
  name: string;
  source: string;
  /** `severity:code` for every diagnostic, in order. Absent means the source must parse silently. */
  codes?: string[];
}

const UNSUPPORTED = 'info:unsupported-construct';

const cases: Case[] = [
  // ------------------------------------------------------------------------------- shapes
  { name: 'shape rect', source: 'flowchart TD\n A[Rect]' },
  { name: 'shape round', source: 'flowchart TD\n A(Round)' },
  { name: 'shape stadium', source: 'flowchart TD\n A([Stadium])' },
  { name: 'shape subroutine', source: 'flowchart TD\n A[[Sub]]' },
  { name: 'shape cylinder', source: 'flowchart TD\n A[(Store)]' },
  { name: 'shape circle', source: 'flowchart TD\n A((Circle))' },
  { name: 'shape double circle', source: 'flowchart TD\n A(((Double)))' },
  { name: 'shape diamond', source: 'flowchart TD\n A{Choice}' },
  { name: 'shape hexagon', source: 'flowchart TD\n A{{Hex}}' },
  { name: 'shape parallelogram', source: 'flowchart TD\n A[/Input/]' },
  { name: 'shape parallelogram alt', source: 'flowchart TD\n A[\\Output\\]' },
  { name: 'shape trapezoid', source: 'flowchart TD\n A[/Trap\\]' },
  { name: 'shape trapezoid alt', source: 'flowchart TD\n A[\\Trap/]' },
  { name: 'shape asymmetric', source: 'flowchart TD\n A>Flag]' },
  { name: 'bare node keeps its id as the label', source: 'flowchart TD\n A' },
  {
    name: 'slanted shapes on one line stay separate',
    source: 'flowchart TD\n A[/x\\] --> B[\\y/]',
  },
  {
    name: 'shape chain does not swallow later brackets',
    source: 'flowchart TD\n A[[sub]] --> B[(db)] --> C([sta])',
  },

  // ------------------------------------------------------------------------------- labels
  { name: 'quoted label keeps a bracket', source: 'flowchart TD\n A["closes ] here"]' },
  { name: 'entities decode', source: 'flowchart TD\n A["#quot;q#quot; #35; #colon; #59;"]' },
  { name: 'numeric entity decodes', source: 'flowchart TD\n A["#8594; go"]' },
  { name: 'br splits lines', source: 'flowchart TD\n A["one<br/>two<br>three"]' },
  { name: 'backslash-n splits lines', source: 'flowchart TD\n A["one\\ntwo"]' },
  { name: 'internal whitespace collapses', source: 'flowchart TD\n A["x     y"]' },
  { name: 'whitespace-only label is empty', source: 'flowchart TD\n A["   "]' },
  {
    name: 'markdown string is reported',
    source: 'flowchart TD\n A["`**bold**`"]',
    codes: [UNSUPPORTED],
  },

  // -------------------------------------------------------------------------------- edges
  { name: 'edge arrow', source: 'flowchart TD\n A --> B' },
  { name: 'edge open', source: 'flowchart TD\n A --- B' },
  { name: 'edge dotted arrow', source: 'flowchart TD\n A -.-> B' },
  { name: 'edge dotted open', source: 'flowchart TD\n A -.- B' },
  { name: 'edge thick arrow', source: 'flowchart TD\n A ==> B' },
  { name: 'edge thick open', source: 'flowchart TD\n A === B' },
  { name: 'edge invisible', source: 'flowchart TD\n A ~~~ B' },
  { name: 'edge circle cap', source: 'flowchart TD\n A --o B' },
  { name: 'edge cross cap', source: 'flowchart TD\n A --x B' },
  { name: 'edge double arrow', source: 'flowchart TD\n A <--> B' },
  { name: 'edge double circle cap', source: 'flowchart TD\n A o--o B' },
  { name: 'edge double cross cap', source: 'flowchart TD\n A x--x B' },
  { name: 'edge double dotted', source: 'flowchart TD\n A <-.-> B' },
  { name: 'edge double thick', source: 'flowchart TD\n A <==> B' },
  { name: 'extra dashes lengthen the arrow', source: 'flowchart TD\n A ---> B' },
  { name: 'extra dashes lengthen the open link', source: 'flowchart TD\n A ---- B' },
  { name: 'link length caps at four', source: 'flowchart TD\n A ---------> B' },
  { name: 'extra dots lengthen the dotted link', source: 'flowchart TD\n A -..-> B' },
  { name: 'extra equals lengthen the thick link', source: 'flowchart TD\n A ==== B' },
  { name: 'extra tildes lengthen the invisible link', source: 'flowchart TD\n A ~~~~ B' },
  { name: 'pipe label', source: 'flowchart TD\n A -->|yes| B' },
  { name: 'inline label', source: 'flowchart TD\n A -- yes --> B' },
  { name: 'inline label without spaces', source: 'flowchart TD\n A --yes--> B' },
  { name: 'inline label on an open link', source: 'flowchart TD\n A -- maybe --- B' },
  { name: 'inline label thick', source: 'flowchart TD\n A == go ==> B' },
  { name: 'inline label dotted', source: 'flowchart TD\n A -. later .-> B' },
  { name: 'inline label lengthens with the closer', source: 'flowchart TD\n A -- far ----> B' },
  { name: 'labels chain without merging', source: 'flowchart TD\n A -- yes --> B -- no --> C' },
  { name: 'open links chain', source: 'flowchart TD\n A --- B --- C' },
  { name: 'arrow links chain', source: 'flowchart TD\n A --> B --> C' },
  { name: 'dotted links chain', source: 'flowchart TD\n A -.-> B -.-> C' },
  { name: 'fan group expands to a product', source: 'flowchart TD\n A & B --> C & D' },
  { name: 'fan group inside a chain', source: 'flowchart TD\n A --> B & C --> D' },
  { name: 'shapes declared inside a fan group', source: 'flowchart TD\n A[One] & B(Two) --> C' },

  // ---------------------------------------------------------------------------- subgraphs
  { name: 'bare subgraph titles itself', source: 'flowchart TD\n subgraph One\n  A --> B\n end' },
  {
    name: 'subgraph with an id and a title',
    source: 'flowchart TD\n subgraph sg [Pipeline]\n  A --> B\n end',
  },
  {
    name: 'subgraph with a quoted title',
    source: 'flowchart TD\n subgraph sg["Build & Test"]\n  A\n end',
  },
  { name: 'subgraph with no name', source: 'flowchart TD\n subgraph\n  A\n end' },
  {
    name: 'nested subgraphs',
    source: 'flowchart TD\n subgraph outer\n  subgraph inner\n   A --> B\n  end\n end',
  },
  {
    name: 'membership latches to the first subgraph a node appears in',
    source: 'flowchart TD\n A --> B\n subgraph sg\n  B --> C\n end\n C --> D',
  },
  {
    name: 'stray end is dropped',
    source: 'flowchart TD\n A --> B\n end',
    codes: ['warning:unexpected-end'],
  },
  {
    name: 'unclosed subgraph auto-closes',
    source: 'flowchart TD\n subgraph sg\n  A --> B',
    codes: ['warning:unclosed-subgraph'],
  },
  {
    name: 'duplicate subgraph id is renamed',
    source: 'flowchart TD\n subgraph sg\n  A\n end\n subgraph sg\n  B\n end',
    codes: ['warning:duplicate-subgraph'],
  },
  {
    name: 'edges cross between two subgraphs',
    source: 'flowchart LR\n subgraph a\n  A --> B\n end\n subgraph b\n  C --> D\n end\n B --> C',
  },

  // ------------------------------------------------------------------------------ classes
  {
    name: 'classDef registers the name only',
    source: 'flowchart TD\n classDef danger fill:#f00,stroke:#900\n A',
  },
  { name: 'classDef registers several names', source: 'flowchart TD\n classDef a,b fill:#f00\n A' },
  { name: 'class assigns to several nodes', source: 'flowchart TD\n A --> B\n class A,B danger' },
  { name: 'triple colon shorthand', source: 'flowchart TD\n A:::danger --> B' },
  { name: 'triple colon after a shape', source: 'flowchart TD\n A[Text]:::danger' },
  { name: 'class names accumulate', source: 'flowchart TD\n A:::one\n class A two' },

  // --------------------------------------------------------------------------- directions
  { name: 'header graph LR', source: 'graph LR\n A --> B' },
  { name: 'header TD maps to TB', source: 'flowchart TD\n A' },
  { name: 'header BT', source: 'flowchart BT\n A --> B' },
  { name: 'header RL', source: 'flowchart RL\n A --> B' },
  { name: 'header without a direction', source: 'flowchart\n A --> B' },
  {
    name: 'unknown direction falls back to TB',
    source: 'flowchart XX\n A --> B',
    codes: ['warning:unknown-direction'],
  },
  { name: 'top-level direction statement', source: 'flowchart TD\n direction RL\n A --> B' },
  {
    name: 'direction inside a subgraph is ignored',
    source: 'flowchart TD\n subgraph sg\n  direction LR\n  A --> B\n end',
    codes: [UNSUPPORTED],
  },

  // ------------------------------------------------------------------ recognized but ignored
  {
    name: 'init directive is ignored',
    source: 'flowchart TD\n %%{init: {"theme":"dark"}}%%\n A --> B',
    codes: [UNSUPPORTED],
  },
  {
    name: 'style is ignored',
    source: 'flowchart TD\n A --> B\n style A fill:#f9f',
    codes: [UNSUPPORTED],
  },
  {
    name: 'linkStyle is ignored',
    source: 'flowchart TD\n A --> B\n linkStyle 0 stroke:#f00',
    codes: [UNSUPPORTED],
  },
  {
    name: 'click is ignored',
    source: 'flowchart TD\n A --> B\n click A callback "tip"',
    codes: [UNSUPPORTED],
  },
  {
    name: 'node metadata is ignored',
    source: 'flowchart TD\n A@{ shape: cyl, label: "x" } --> B',
    codes: [UNSUPPORTED],
  },
  {
    name: 'renderer suffix is ignored',
    source: 'flowchart-elk LR\n A --> B',
    codes: [UNSUPPORTED],
  },

  // ---------------------------------------------------------------------------------- a11y
  { name: 'accTitle', source: 'flowchart TD\n accTitle: Publish flow\n A --> B' },
  { name: 'accDescr on one line', source: 'flowchart TD\n accDescr: How a draft ships\n A --> B' },
  {
    name: 'accDescr block',
    source: 'flowchart TD\n accDescr {\n  first line\n  second line\n }\n A --> B',
  },
  {
    name: 'unclosed accDescr block',
    source: 'flowchart TD\n accDescr {\n  dangling',
    codes: ['warning:unclosed-block'],
  },

  // ------------------------------------------------------------------------------ recovery
  {
    name: 'one bad line among five leaves the rest',
    source: 'flowchart TD\n A --> B\n B ??? C\n B --> C\n C --> D\n D --> E',
    codes: ['error:unexpected-token'],
  },
  {
    name: 'a failed statement commits nothing',
    source: 'flowchart TD\n A -->\n B --> C',
    codes: ['error:expected-node'],
  },
  {
    name: 'unterminated shape is one error',
    source: 'flowchart TD\n A[unterminated --> B\n C --> D',
    codes: ['error:unterminated-shape'],
  },
  {
    name: 'unterminated metadata is one error',
    source: 'flowchart TD\n A@{ shape --> B\n C --> D',
    codes: ['error:unterminated-shape'],
  },
  {
    name: 'missing class name after triple colon',
    source: 'flowchart TD\n A::: --> B\n C --> D',
    codes: ['error:expected-class'],
  },
  {
    name: 'every statement failing yields no ir',
    source: 'flowchart TD\n A[oops\n B(oops',
    codes: ['error:unterminated-shape', 'error:unterminated-shape'],
  },
  { name: 'header only is an empty diagram', source: 'flowchart TD' },
  { name: 'comments are stripped', source: 'flowchart TD\n %% a note\n A --> B %% trailing' },
  { name: 'semicolons separate statements', source: 'flowchart TD;A-->B;B-->C' },
  { name: 'blank lines are skipped', source: 'flowchart TD\n\n\n A --> B\n\n' },
  { name: 'forward references auto-create nodes', source: 'flowchart TD\n A --> B\n B[Named]' },
  { name: 'self loop', source: 'flowchart TD\n A --> A' },
  { name: 'cycle', source: 'flowchart TD\n A --> B\n B --> C\n C --> A' },
];

describe('parseFlowchart', () => {
  it.each(cases)('$name', ({ source, codes }) => {
    const result = parse(source);

    expect(result.codes).toEqual(codes ?? []);
    expect(digest(result.ir)).toMatchSnapshot();
  });

  it('gives up on a link label crafted to make the pattern backtrack', () => {
    // The label patterns used to be quadratic on a *failed* match, so this line — comfortably
    // inside the source limit — took half a second of blocked main thread. Asserting the outcome
    // rather than a wall clock: the caps make it fail immediately, as one ordinary bad statement.
    const line = ` A -.b${' '.repeat(9900)}${'.'.repeat(9900)}`;

    expect(parse(`flowchart TD\n${line}`).codes).toEqual(['error:unexpected-token']);
  });

  it('covers every shape in the delimiter table', () => {
    const shapes = new Set<string>();

    for (const entry of cases) {
      for (const node of parse(entry.source).ir?.nodes.values() ?? []) {
        shapes.add(node.shape);
      }
    }

    expect([...shapes].sort()).toEqual([
      'asymmetric',
      'circle',
      'cylinder',
      'diamond',
      'double-circle',
      'hexagon',
      'parallelogram',
      'parallelogram-alt',
      'rect',
      'round',
      'stadium',
      'subroutine',
      'trapezoid',
      'trapezoid-alt',
    ]);
  });

  it('keeps declaration order for nodes and edges', () => {
    const ir = parse('flowchart TD\n C --> A\n A --> B\n B --> C').ir;

    expect([...(ir?.nodes.keys() ?? [])]).toEqual(['C', 'A', 'B']);
    expect(ir?.edges.map((edge) => edge.id)).toEqual(['C->A#0', 'A->B#1', 'B->C#2']);
  });

  it('spans point at the failing line', () => {
    const report = new Reporter();
    const source = 'flowchart TD\nA --> B\nB ??? C';

    parseFlowchart(source, { report, limits: defaultLimits });

    const span = report.diagnostics[0]?.span;

    expect(span?.line).toBe(3);
    expect(source.slice(span?.offset ?? 0, (span?.offset ?? 0) + (span?.length ?? 0))).toBe(
      'B ??? C',
    );
  });

  it('never throws on mutated sources', async () => {
    const { mutations } = await import('@testing/diagram/fuzz.ts');
    const seed =
      'flowchart TD\n subgraph sg [Title]\n  A[Start] -->|go| B{Ready?}\n end\n B -.-> C';

    for (const mutated of mutations(seed, 400, 11)) {
      expect(() => parse(mutated)).not.toThrow();
    }
  });
});
