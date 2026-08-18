import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { mutations } from '@testing/diagram/fuzz.ts';

import { defaultLimits } from '../../build.ts';
import { Reporter } from '../../core/diagnostics.ts';
import type { Diagnostic } from '../../types.ts';
import type { ClassIR } from './ir.ts';
import { memberLine } from './ir.ts';
import { parseClass } from './parse.ts';

function parse(source: string): { ir: ClassIR | null; diagnostics: readonly Diagnostic[] } {
  const report = new Reporter();

  return parseClass(source, { report, limits: defaultLimits });
}

/** Snapshot view: the structure, without spans or the echoed source. */
function compact(ir: ClassIR | null): unknown {
  if (!ir) {
    return null;
  }

  return {
    direction: ir.direction,
    classes: ir.classes.map(
      (entry) =>
        `${entry.id}` +
        (entry.label === entry.id ? '' : ` "${entry.label}"`) +
        (entry.annotation ? ` <<${entry.annotation}>>` : '') +
        (entry.namespace ? ` in ${entry.namespace}` : '') +
        ` {${[...entry.attributes, ...entry.methods].map(memberLine).join('; ')}}`,
    ),
    relations: ir.relations.map(
      (relation) =>
        `${relation.fromCardinality ? `"${relation.fromCardinality}" ` : ''}${relation.from} ` +
        `${relation.fromMarker}${relation.dotted ? '..' : '--'}${relation.toMarker} ` +
        `${relation.toCardinality ? `"${relation.toCardinality}" ` : ''}${relation.to}` +
        (relation.label ? ` : ${relation.label.join(' | ')}` : ''),
    ),
    namespaces: ir.namespaces.map((entry) => entry.id),
    accTitle: ir.accTitle,
    accDescr: ir.accDescr,
  };
}

function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

const header = 'classDiagram';

const cases: { name: string; source: string }[] = [
  { name: 'header only', source: header },
  { name: 'v2 header', source: 'classDiagram-v2\n  class Foo' },
  { name: 'bare class declaration', source: `${header}\n  class Foo` },
  { name: 'quoted label', source: `${header}\n  class Foo["A friendly name"]` },
  { name: 'generic class', source: `${header}\n  class Box~T~` },
  { name: 'member line', source: `${header}\n  Foo : +int count` },
  { name: 'method member', source: `${header}\n  Foo : +render(target) void` },
  {
    name: 'every visibility marker',
    source: `${header}\n  Foo : +public\n  Foo : -private\n  Foo : #protected\n  Foo : ~package`,
  },
  {
    name: 'body block',
    source: `${header}\n  class Foo {\n    +int count\n    +render() void\n  }`,
  },
  { name: 'single line body', source: `${header}\n  class Foo { +int count }` },
  { name: 'empty body', source: `${header}\n  class Foo {\n  }` },
  { name: 'generic member type', source: `${header}\n  class Foo {\n    -List~Line~ lines\n  }` },
  {
    name: 'annotation inside a body',
    source: `${header}\n  class Shape {\n    <<interface>>\n    +area() float\n  }`,
  },
  { name: 'standalone annotation', source: `${header}\n  class Shape\n  <<abstract>> Shape` },
  { name: 'inheritance', source: `${header}\n  Animal <|-- Duck` },
  { name: 'reversed inheritance', source: `${header}\n  Duck --|> Animal` },
  { name: 'composition', source: `${header}\n  Order *-- OrderLine` },
  { name: 'aggregation', source: `${header}\n  Order o-- Coupon` },
  { name: 'association', source: `${header}\n  Order --> Invoice` },
  { name: 'plain link', source: `${header}\n  Region -- Zone` },
  { name: 'dependency', source: `${header}\n  Invoice ..> Ledger` },
  { name: 'realization', source: `${header}\n  Payment <|.. CardPayment` },
  { name: 'dotted link', source: `${header}\n  Warehouse .. Region` },
  { name: 'two way association', source: `${header}\n  A <--> B` },
  { name: 'relation label', source: `${header}\n  Customer --> Order : places` },
  { name: 'cardinalities', source: `${header}\n  Customer "1" --> "many" Order : places` },
  { name: 'cardinalities without spaces', source: `${header}\n  A"1"-->"0..*"B` },
  { name: 'long line', source: `${header}\n  A ---> B` },
  { name: 'namespace', source: `${header}\n  namespace billing {\n    class Invoice\n  }` },
  { name: 'direction LR', source: `${header}\n  direction LR\n  A --> B` },
  { name: 'direction TD maps to TB', source: `${header}\n  direction TD\n  A --> B` },
  {
    name: 'accessibility statements',
    source: `${header}\n  accTitle: Domain model\n  accDescr: Two classes\n  A --> B`,
  },
  { name: 'entities in a label', source: `${header}\n  A --> B : say #quot;hi#quot;` },
  { name: 'semicolon separated statements', source: `${header}\n  A --> B; B --> C` },
  { name: 'comments are stripped', source: `${header}\n  %% a note\n  A --> B %% trailing` },
  { name: 'self relation', source: `${header}\n  A --> A : retries` },
];

describe('parseClass', () => {
  it.each(cases)('$name', ({ source }) => {
    expect(compact(parse(source).ir)).toMatchSnapshot();
  });
});

describe('parseClass structure', () => {
  it('splits members into attributes and methods by their argument list', () => {
    const ir = parse(`${header}\n  class Foo {\n    +int count\n    +render() void\n  }`)
      .ir as ClassIR;
    const foo = ir.classes[0] as ClassIR['classes'][number];

    expect(foo.attributes.map(memberLine)).toEqual(['+int count']);
    expect(foo.methods.map(memberLine)).toEqual(['+render() void']);
  });

  it('renders generics as angle brackets in names and in member types', () => {
    const ir = parse(`${header}\n  class Box~T~ {\n    -List~Line~ lines\n  }`).ir as ClassIR;
    const box = ir.classes[0] as ClassIR['classes'][number];

    expect(box.id).toBe('Box');
    expect(box.label).toBe('Box<T>');
    expect(memberLine(box.attributes[0] as ClassIR['classes'][number]['attributes'][number])).toBe(
      '-List<Line> lines',
    );
  });

  it('keeps the marker on the end it was written at', () => {
    const ir = parse(`${header}\n  Animal <|-- Duck\n  Duck --|> Bird`).ir as ClassIR;

    expect(ir.relations[0]).toMatchObject({ fromMarker: 'inheritance', toMarker: 'none' });
    expect(ir.relations[1]).toMatchObject({ fromMarker: 'none', toMarker: 'inheritance' });
  });

  it('puts a class declared inside a namespace in it', () => {
    const ir = parse(`${header}\n  namespace billing {\n    class Invoice\n  }\n  class Loose`)
      .ir as ClassIR;
    const namespaces = Object.fromEntries(ir.classes.map((entry) => [entry.id, entry.namespace]));

    expect(namespaces).toEqual({ Invoice: 'billing', Loose: null });
    expect(ir.namespaces.map((entry) => entry.id)).toEqual(['billing']);
  });

  it('declares a class named only by a relation', () => {
    const ir = parse(`${header}\n  Animal <|-- Duck`).ir as ClassIR;

    expect(ir.classes.map((entry) => entry.id)).toEqual(['Animal', 'Duck']);
  });

  it('refines a class declared before it is described', () => {
    const ir = parse(
      `${header}\n  A --> B\n  class B["Bee"] {\n    <<interface>>\n    +buzz()\n  }`,
    ).ir as ClassIR;
    const b = ir.classes.find((entry) => entry.id === 'B');

    expect(b).toMatchObject({ label: 'Bee', annotation: 'interface' });
    expect(b?.methods).toHaveLength(1);
  });

  it('keeps the span of the line a class was declared on', () => {
    const ir = parse(`${header}\n  class Foo`).ir as ClassIR;

    expect(ir.classes[0]?.span).toMatchObject({ line: 2, column: 3 });
  });
});

describe('parseClass recovery', () => {
  it('keeps the good statements around a bad one', () => {
    const { ir, diagnostics } = parse(`${header}\n  A --> B\n  A ~~~ B\n  B --> C`);

    expect((ir as ClassIR).relations).toHaveLength(2);
    expect(codes(diagnostics)).toEqual(['unknown-statement']);
    expect(diagnostics[0]).toMatchObject({ severity: 'error', span: { line: 3 } });
  });

  it('declares nothing from a statement that failed', () => {
    const { ir } = parse(`${header}\n  A --> B\n  Ghost ~~~ Other`);

    expect((ir as ClassIR).classes.map((entry) => entry.id)).toEqual(['A', 'B']);
  });

  it('reports a missing header', () => {
    const { ir, diagnostics } = parse('flowchart TD\n  A --> B');

    expect(ir).toBeNull();
    expect(codes(diagnostics)).toEqual(['missing-header']);
  });

  it('warns about an unclosed body and still keeps its members', () => {
    const { ir, diagnostics } = parse(`${header}\n  class Foo {\n    +int count`);

    expect(codes(diagnostics)).toEqual(['unclosed-block']);
    expect((ir as ClassIR).classes[0]?.attributes).toHaveLength(1);
  });

  it('warns about an unclosed namespace', () => {
    const { diagnostics } = parse(`${header}\n  namespace billing {\n    class Invoice`);

    expect(codes(diagnostics)).toEqual(['unclosed-block']);
  });

  it('drops a stray closing brace', () => {
    const { ir, diagnostics } = parse(`${header}\n  A --> B\n  }`);

    expect(codes(diagnostics)).toEqual(['unexpected-end']);
    expect((ir as ClassIR).relations).toHaveLength(1);
  });

  it('rejects an unknown direction', () => {
    expect(codes(parse(`${header}\n  direction sideways`).diagnostics)).toEqual([
      'unknown-direction',
    ]);
  });

  it('requires a block after a namespace', () => {
    expect(codes(parse(`${header}\n  namespace billing`).diagnostics)).toEqual(['expected-block']);
  });

  it('never throws on truncated or hostile input', () => {
    const sources = [
      header,
      `${header}\n  class`,
      `${header}\n  class Foo {`,
      `${header}\n  class Foo["unterminated`,
      `${header}\n  A -->`,
      `${header}\n  --> B`,
      `${header}\n  <|--`,
      `${header}\n  }}}`,
      `${header}\n  A --> B :`,
      `${header}\n  namespace`,
      `${header}\n  <<`,
      `${header}\n  A "1" B`,
      `${header}\n  class X {\n  class Y {\n  class Z {`,
    ];

    for (const source of sources) {
      expect(() => parse(source), source).not.toThrow();
    }
  });
});

describe('parseClass unsupported constructs', () => {
  it.each([
    ['classDef highlight fill:#f00', 'unsupported-construct'],
    ['cssClass "A" highlight', 'unsupported-construct'],
    ['style A fill:#f00', 'unsupported-construct'],
    ['click A call handler()', 'unsupported-construct'],
    ['callback A "handler"', 'unsupported-construct'],
    ['link A "https://example.com"', 'unsupported-construct'],
    ['note "a stray thought"', 'unsupported-construct'],
    ['note for A "a stray thought"', 'unsupported-construct'],
    ['%%{init: {"theme": "dark"}}%%', 'unsupported-directive'],
  ])('reports %s as %s and keeps parsing', (statement, code) => {
    const { ir, diagnostics } = parse(`${header}\n  ${statement}\n  A --> B`);

    expect(codes(diagnostics)).toEqual([code]);
    expect(diagnostics[0]?.severity).toBe('info');
    expect((ir as ClassIR).relations).toHaveLength(1);
  });

  it('reports a `:::` class assignment and keeps the statement it was written on', () => {
    const { ir, diagnostics } = parse(`${header}\n  class Foo:::highlight`);

    expect(codes(diagnostics)).toEqual(['unsupported-construct']);
    expect(diagnostics[0]?.severity).toBe('info');
    expect((ir as ClassIR).classes.map((entry) => entry.id)).toEqual(['Foo']);
  });

  it('reports a member modifier but still draws the member', () => {
    const { ir, diagnostics } = parse(`${header}\n  class Foo {\n    +count()*\n  }`);

    expect(codes(diagnostics)).toEqual(['unsupported-construct']);
    expect((ir as ClassIR).classes[0]?.methods.map(memberLine)).toEqual(['+count()*']);
  });
});

describe('parseClass accessibility blocks', () => {
  it('reads a multi-line accDescr block', () => {
    const { ir, diagnostics } = parse(
      `${header}\n  accDescr {\n    the billing\n    model\n  }\n  class Foo`,
    );

    expect(codes(diagnostics)).toEqual([]);
    expect(ir?.accDescr).toBe('the billing model');
    expect((ir as ClassIR).classes.map((entry) => entry.id)).toEqual(['Foo']);
  });
});

describe('parseClass robustness', () => {
  it.each(loadCorpus('class'))('$name survives 200 mutations', ({ source }) => {
    for (const mutated of mutations(source, 200, 11)) {
      expect(() => parse(mutated), mutated).not.toThrow();
    }
  });
});
