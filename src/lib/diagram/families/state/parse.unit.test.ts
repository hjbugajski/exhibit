import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { mutations } from '@testing/diagram/fuzz.ts';

import { defaultLimits } from '../../build.ts';
import { Reporter } from '../../core/diagnostics.ts';
import type { Diagnostic } from '../../types.ts';
import type { StateIR } from './ir.ts';
import { parseState } from './parse.ts';

function parse(source: string): { ir: StateIR | null; diagnostics: readonly Diagnostic[] } {
  const report = new Reporter();

  return parseState(source, { report, limits: defaultLimits });
}

/** Snapshot view: the structure, without spans or the echoed source. */
function compact(ir: StateIR | null): unknown {
  if (!ir) {
    return null;
  }

  return {
    direction: ir.direction,
    states: ir.states.map(
      (state) =>
        `${state.type} ${state.id}` +
        (state.label.length > 0 ? ` "${state.label.join(' | ')}"` : '') +
        (state.parent ? ` in ${state.parent}` : ''),
    ),
    transitions: ir.transitions.map(
      (transition) =>
        `${transition.from} --> ${transition.to}` +
        (transition.label ? ` : ${transition.label.join(' | ')}` : ''),
    ),
    notes: ir.notes.map((note) => `${note.placement} of ${note.target}: ${note.label.join(' | ')}`),
    accTitle: ir.accTitle,
    accDescr: ir.accDescr,
  };
}

function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

const header = 'stateDiagram-v2';

const cases: { name: string; source: string }[] = [
  { name: 'header only', source: header },
  { name: 'v1 header', source: 'stateDiagram\n  A --> B' },
  { name: 'start and end markers', source: `${header}\n  [*] --> Idle\n  Idle --> [*]` },
  {
    name: 'two start markers stay separate',
    source: `${header}\n  [*] --> A\n  [*] --> B`,
  },
  { name: 'transition label', source: `${header}\n  Idle --> Running : start` },
  { name: 'transition without spaces', source: `${header}\n  Idle-->Running` },
  { name: 'long arrow', source: `${header}\n  A ---> B` },
  { name: 'description statement', source: `${header}\n  A\n  A : waiting for work` },
  { name: 'two descriptions append', source: `${header}\n  A : first\n  A : second` },
  { name: 'quoted state declaration', source: `${header}\n  state "Long description" as s2` },
  { name: 'state keyword declaration', source: `${header}\n  state Alone` },
  { name: 'state keyword with description', source: `${header}\n  state Alone : idle` },
  { name: 'choice stereotype', source: `${header}\n  state Pick <<choice>>\n  Pick --> A` },
  { name: 'fork and join', source: `${header}\n  state F <<fork>>\n  state J <<join>>` },
  {
    name: 'composite state',
    source: `${header}\n  [*] --> Active\n  state Active {\n    [*] --> Warming\n    Warming --> Ready\n  }\n  Active --> [*]`,
  },
  {
    name: 'nested composite states',
    source: `${header}\n  state Outer {\n    state Inner {\n      A --> B\n    }\n    Inner --> C\n  }`,
  },
  {
    name: 'quoted composite state',
    source: `${header}\n  state "Doing work" as Active {\n    A --> B\n  }`,
  },
  {
    name: 'composite declared before it is opened',
    source: `${header}\n  A --> Big\n  state Big {\n    B --> C\n  }`,
  },
  { name: 'note on one line', source: `${header}\n  A --> B\n  note right of A : starts here` },
  {
    name: 'note block',
    source: `${header}\n  A --> B\n  note left of B\n    two lines\n    of prose\n  end note`,
  },
  { name: 'direction LR', source: `${header}\n  direction LR\n  A --> B` },
  { name: 'direction TD maps to TB', source: `${header}\n  direction TD\n  A --> B` },
  {
    name: 'accessibility statements',
    source: `${header}\n  accTitle: Publish flow\n  accDescr: Two states\n  A --> B`,
  },
  {
    name: 'label breaks and entities',
    source: `${header}\n  A --> B : "first<br/>second #quot;quoted#quot;"`,
  },
  { name: 'entities outside quotes', source: `${header}\n  A --> B : say #quot;hi#quot;` },
  { name: 'semicolon separated statements', source: `${header}\n  A --> B; B --> C` },
  { name: 'comments are stripped', source: `${header}\n  %% a note\n  A --> B %% trailing` },
  { name: 'self transition', source: `${header}\n  A --> A : retry` },
  { name: 'blank label is dropped', source: `${header}\n  A --> B : ` },
];

describe('parseState', () => {
  it.each(cases)('$name', ({ source }) => {
    expect(compact(parse(source).ir)).toMatchSnapshot();
  });
});

describe('parseState structure', () => {
  it('gives every `[*]` occurrence its own marker state', () => {
    const ir = parse(`${header}\n  [*] --> A\n  A --> [*]\n  [*] --> B`).ir as StateIR;
    const markers = ir.states.filter((state) => state.type !== 'simple');

    expect(markers.map((state) => state.type)).toEqual(['start', 'end', 'start']);
    expect(new Set(markers.map((state) => state.id)).size).toBe(3);
  });

  it('parents states declared inside a composite state', () => {
    const ir = parse(`${header}\n  state Big {\n    A --> B\n  }\n  C --> D`).ir as StateIR;
    const parents = Object.fromEntries(ir.states.map((state) => [state.id, state.parent]));

    expect(parents).toMatchObject({ Big: null, A: 'Big', B: 'Big', C: null, D: null });
  });

  it('upgrades a state to composite when it is opened later', () => {
    const ir = parse(`${header}\n  A --> Big\n  state Big {\n    B --> C\n  }`).ir as StateIR;

    expect(ir.states.find((state) => state.id === 'Big')?.type).toBe('composite');
  });

  it('closes a composite that opens and closes on one line', () => {
    const { ir, diagnostics } = parse(`${header}\n  state A { }\n  A --> B\n  state "x" as s1 {}`);
    const parents = Object.fromEntries(
      (ir as StateIR).states.map((state) => [state.id, state.parent]),
    );

    expect(codes(diagnostics)).toEqual([]);
    expect(parents).toMatchObject({ A: null, B: null, s1: null });
    expect((ir as StateIR).states.find((state) => state.id === 'A')?.type).toBe('composite');
  });

  it('keeps a semicolon inside a transition label', () => {
    const { ir, diagnostics } = parse(`${header}\n  A --> B : do x; then y`);

    expect(codes(diagnostics)).toEqual([]);
    expect((ir as StateIR).transitions[0]?.label).toEqual(['do x; then y']);
  });

  it('keeps the span of the line a state was declared on', () => {
    const ir = parse(`${header}\n  A --> B`).ir as StateIR;

    expect(ir.states[0]?.span).toMatchObject({ line: 2, column: 3 });
  });
});

describe('parseState accessibility blocks', () => {
  it('reads a multi-line accDescr block', () => {
    const { ir, diagnostics } = parse(
      `${header}\n  accTitle: T\n  accDescr {\n    some description\n    over two lines\n  }\n  A --> B`,
    );

    expect(codes(diagnostics)).toEqual([]);
    expect(ir?.accDescr).toBe('some description over two lines');
    expect(ir?.accTitle).toBe('T');
    expect((ir as StateIR).transitions).toHaveLength(1);
  });

  it('closes an accDescr block that ends on the text line', () => {
    const { ir, diagnostics } = parse(`${header}\n  accDescr { one line }\n  A --> B`);

    expect(codes(diagnostics)).toEqual([]);
    expect(ir?.accDescr).toBe('one line');
  });

  it('warns about an accDescr block that is never closed', () => {
    const { ir, diagnostics } = parse(`${header}\n  accDescr {\n    dangling`);

    expect(codes(diagnostics)).toEqual(['unclosed-block']);
    expect(ir?.accDescr).toBe('dangling');
  });
});

describe('parseState recovery', () => {
  it('keeps the good statements around a bad one', () => {
    const { ir, diagnostics } = parse(
      `${header}\n  A --> B\n  A ~~~ B\n  B --> C\n  C --> D\n  D --> E`,
    );

    expect((ir as StateIR).transitions).toHaveLength(4);
    expect(codes(diagnostics)).toEqual(['unknown-statement']);
    expect(diagnostics[0]).toMatchObject({ severity: 'error', span: { line: 3 } });
  });

  it('declares nothing from a statement that failed', () => {
    const { ir } = parse(`${header}\n  A --> B\n  Ghost ~~~ Other`);

    expect((ir as StateIR).states.map((state) => state.id)).toEqual(['A', 'B']);
  });

  it('reports a missing header', () => {
    const { ir, diagnostics } = parse('flowchart TD\n  A --> B');

    expect(ir).toBeNull();
    expect(codes(diagnostics)).toEqual(['missing-header']);
  });

  it('warns about an unclosed composite state and still nests its members', () => {
    const { ir, diagnostics } = parse(`${header}\n  state Big {\n    A --> B`);

    expect(codes(diagnostics)).toEqual(['unclosed-block']);
    expect((ir as StateIR).states.find((state) => state.id === 'A')?.parent).toBe('Big');
  });

  it('drops a stray closing brace', () => {
    const { ir, diagnostics } = parse(`${header}\n  A --> B\n  }`);

    expect(codes(diagnostics)).toEqual(['unexpected-end']);
    expect((ir as StateIR).transitions).toHaveLength(1);
  });

  it('warns about an unclosed note but keeps its text', () => {
    const { ir, diagnostics } = parse(`${header}\n  A --> B\n  note right of A\n    dangling`);

    expect(codes(diagnostics)).toEqual(['unclosed-note']);
    expect((ir as StateIR).notes[0]?.label).toEqual(['dangling']);
  });

  it('rejects an unknown direction', () => {
    expect(codes(parse(`${header}\n  direction sideways`).diagnostics)).toEqual([
      'unknown-direction',
    ]);
  });

  it('requires `as` after a quoted label', () => {
    expect(codes(parse(`${header}\n  state "Label" s2`).diagnostics)).toEqual(['expected-as']);
  });

  it('requires a placement on a note', () => {
    expect(codes(parse(`${header}\n  note over A : hm`).diagnostics)).toEqual([
      'unsupported-construct',
    ]);
  });

  it('never throws on truncated or hostile input', () => {
    const sources = [
      header,
      `${header}\n  [*] -->`,
      `${header}\n  state`,
      `${header}\n  state "unterminated as X`,
      `${header}\n  note right of`,
      `${header}\n  -->`,
      `${header}\n  }}}`,
      `${header}\n  A --> B :`,
      `${header}\n  state X {\n  state Y {\n  state Z {`,
    ];

    for (const source of sources) {
      expect(() => parse(source), source).not.toThrow();
    }
  });
});

describe('parseState unsupported constructs', () => {
  it.each([
    ['classDef highlight fill:#f00', 'unsupported-construct'],
    ['class A highlight', 'unsupported-construct'],
    ['style A fill:#f00', 'unsupported-construct'],
    ['%%{init: {"theme": "dark"}}%%', 'unsupported-directive'],
  ])('reports %s as %s and keeps parsing', (statement, code) => {
    const { ir, diagnostics } = parse(`${header}\n  ${statement}\n  A --> B`);

    expect(codes(diagnostics)).toEqual([code]);
    expect(diagnostics[0]?.severity).toBe('info');
    expect((ir as StateIR).transitions).toHaveLength(1);
  });

  it('reports `hide empty description` rather than failing on it', () => {
    const { ir, diagnostics } = parse(`${header}\n  hide empty description\n  [*] --> A`);

    expect(codes(diagnostics)).toEqual(['unsupported-construct']);
    expect(diagnostics[0]?.severity).toBe('info');
    expect((ir as StateIR).transitions).toHaveLength(1);
  });

  it('still reads `hide` as a state name anywhere else', () => {
    const { ir, diagnostics } = parse(`${header}\n  hide --> A`);

    expect(codes(diagnostics)).toEqual([]);
    expect((ir as StateIR).transitions[0]?.from).toBe('hide');
  });

  it('warns about a concurrency separator', () => {
    const { ir, diagnostics } = parse(
      `${header}\n  state Big {\n    A --> B\n    --\n    C --> D\n  }`,
    );

    expect(codes(diagnostics)).toEqual(['unsupported-construct']);
    expect(diagnostics[0]?.severity).toBe('warning');
    expect((ir as StateIR).transitions).toHaveLength(2);
  });

  it('ignores a direction inside a composite state', () => {
    const { ir, diagnostics } = parse(
      `${header}\n  direction LR\n  state Big {\n    direction TB\n    A --> B\n  }`,
    );

    expect(codes(diagnostics)).toEqual(['unsupported-construct']);
    expect((ir as StateIR).direction).toBe('LR');
  });
});

describe('parseState robustness', () => {
  it.each(loadCorpus('state'))('$name survives 200 mutations', ({ source }) => {
    for (const mutated of mutations(source, 200, 11)) {
      expect(() => parse(mutated), mutated).not.toThrow();
    }
  });
});
