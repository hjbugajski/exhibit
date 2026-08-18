import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { mutations } from '@testing/diagram/fuzz.ts';

import { defaultLimits } from '../../build.ts';
import { Reporter } from '../../core/diagnostics.ts';
import type { Diagnostic } from '../../types.ts';
import type { ErIR } from './ir.ts';
import { parseEr } from './parse.ts';

function parse(source: string): { ir: ErIR | null; diagnostics: readonly Diagnostic[] } {
  const report = new Reporter();

  return parseEr(source, { report, limits: defaultLimits });
}

/** Snapshot view: the structure, without spans or the echoed source. */
function compact(ir: ErIR | null): unknown {
  if (!ir) {
    return null;
  }

  return {
    entities: ir.entities.map(
      (entity) =>
        entity.id +
        (entity.label.length > 0 ? ` "${entity.label.join(' | ')}"` : '') +
        (entity.attributes.length > 0
          ? ` { ${entity.attributes
              .map(
                (attribute) =>
                  `${attribute.type} ${attribute.name}` +
                  (attribute.keys.length > 0 ? ` ${attribute.keys.join('+')}` : '') +
                  (attribute.comment === undefined ? '' : ` "${attribute.comment}"`),
              )
              .join('; ')} }`
          : ''),
    ),
    relationships: ir.relationships.map(
      (relationship) =>
        `${relationship.from} (${relationship.fromCardinality}) ` +
        `${relationship.identifying ? '--' : '..'} ` +
        `(${relationship.toCardinality}) ${relationship.to}` +
        (relationship.label ? ` : ${relationship.label.join(' | ')}` : ''),
    ),
    accTitle: ir.accTitle,
    accDescr: ir.accDescr,
  };
}

function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

const header = 'erDiagram';

const cases: { name: string; source: string }[] = [
  { name: 'header only', source: header },
  { name: 'bare entity', source: `${header}\n  CUSTOMER` },
  { name: 'aliased entity', source: `${header}\n  p[Person]` },
  { name: 'quoted entity', source: `${header}\n  "Customer Account"` },
  { name: 'one relationship', source: `${header}\n  CUSTOMER ||--o{ ORDER : places` },
  { name: 'relationship without spaces', source: `${header}\n  CUSTOMER||--o{ORDER:places` },
  { name: 'non-identifying relationship', source: `${header}\n  A }|..|{ B : uses` },
  { name: 'quoted relationship label', source: `${header}\n  A ||--|| B : "has exactly one"` },
  { name: 'empty relationship label', source: `${header}\n  A ||--|| B : ""` },
  { name: 'relationship without a label', source: `${header}\n  A ||--|| B` },
  { name: 'zero or one both ends', source: `${header}\n  A |o--o| B : maybe` },
  { name: 'zero or more both ends', source: `${header}\n  A }o--o{ B : many` },
  { name: 'one or more both ends', source: `${header}\n  A }|--|{ B : some` },
  {
    name: 'attribute block',
    source: `${header}\n  CUSTOMER {\n    string name\n    int age\n  }`,
  },
  {
    name: 'attribute keys and comment',
    source: `${header}\n  CUSTOMER {\n    string name PK "the name"\n    string other FK, UK\n  }`,
  },
  {
    name: 'array and generic types',
    source: `${header}\n  A {\n    string[] tags\n    list~int~ ids\n  }`,
  },
  { name: 'empty attribute block', source: `${header}\n  A {\n  }` },
  {
    name: 'block on an entity named by a relationship first',
    source: `${header}\n  A ||--|| B : has\n  A {\n    int id PK\n  }`,
  },
  { name: 'alias kept from either mention', source: `${header}\n  p ||--|| B : has\n  p[Person]` },
  { name: 'self relationship', source: `${header}\n  A ||--o{ A : supervises` },
  {
    name: 'accessibility statements',
    source: `${header}\n  accTitle: Orders\n  accDescr: Who buys what\n  A ||--|| B : has`,
  },
  {
    name: 'comments are stripped',
    source: `${header}\n  %% a note\n  A ||--|| B : has %% trailing`,
  },
  {
    name: 'label breaks and entities',
    source: `${header}\n  A ||--|| B : "first<br/>#quot;x#quot;"`,
  },
];

describe('parseEr', () => {
  it.each(cases)('$name', ({ source }) => {
    expect(compact(parse(source).ir)).toMatchSnapshot();
  });
});

describe('parseEr structure', () => {
  it('declares an entity named only by a relationship', () => {
    const ir = parse(`${header}\n  A ||--o{ B : has`).ir as ErIR;

    expect(ir.entities.map((entity) => entity.id)).toEqual(['A', 'B']);
  });

  it('keeps entities in declaration order', () => {
    const ir = parse(`${header}\n  Z ||--|| Y : has\n  M\n  Y ||--|| X : has`).ir as ErIR;

    expect(ir.entities.map((entity) => entity.id)).toEqual(['Z', 'Y', 'M', 'X']);
  });

  it('reads every cardinality pair', () => {
    const ir = parse(
      `${header}
  A |o--o| B : a
  B ||--|| C : b
  C }o--o{ D : c
  D }|--|{ E : d`,
    ).ir as ErIR;

    expect(ir.relationships.map((r) => [r.fromCardinality, r.toCardinality])).toEqual([
      ['zero-or-one', 'zero-or-one'],
      ['exactly-one', 'exactly-one'],
      ['zero-or-more', 'zero-or-more'],
      ['one-or-more', 'one-or-more'],
    ]);
  });

  it('distinguishes identifying from non-identifying relationships', () => {
    const ir = parse(`${header}\n  A ||--|| B : x\n  A ||..|| B : y`).ir as ErIR;

    expect(ir.relationships.map((relationship) => relationship.identifying)).toEqual([true, false]);
  });

  it('keeps the span of the line an entity was declared on', () => {
    const ir = parse(`${header}\n  A ||--|| B : has`).ir as ErIR;

    expect(ir.entities[0]?.span).toMatchObject({ line: 2, column: 3 });
  });

  it('appends attributes in the order they were written', () => {
    const ir = parse(`${header}\n  A {\n    int one\n    int two\n    int three\n  }`).ir as ErIR;

    expect(ir.entities[0]?.attributes.map((attribute) => attribute.name)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('drops an empty attribute comment rather than storing it', () => {
    const ir = parse(`${header}\n  A {\n    int id PK ""\n  }`).ir as ErIR;

    expect(ir.entities[0]?.attributes[0]?.comment).toBeUndefined();
  });
});

describe('parseEr recovery', () => {
  it('keeps the good statements around a bad one', () => {
    const { ir, diagnostics } = parse(
      `${header}\n  A ||--|| B : x\n  B --> C\n  C ||--|| D : y\n  D ||--|| E : z`,
    );

    expect((ir as ErIR).relationships).toHaveLength(3);
    expect(codes(diagnostics)).toEqual(['unknown-relationship']);
    expect(diagnostics[0]).toMatchObject({ severity: 'error', span: { line: 3 } });
  });

  it('declares nothing from a relationship that failed', () => {
    const { ir } = parse(`${header}\n  A ||--|| B : x\n  Ghost ~~~ Other`);

    expect((ir as ErIR).entities.map((entity) => entity.id)).toEqual(['A', 'B']);
  });

  it('reports a missing header', () => {
    const { ir, diagnostics } = parse('flowchart TD\n  A --> B');

    expect(ir).toBeNull();
    expect(codes(diagnostics)).toEqual(['missing-header']);
  });

  it('warns about an unclosed attribute block but keeps its attributes', () => {
    const { ir, diagnostics } = parse(`${header}\n  A {\n    int id PK`);

    expect(codes(diagnostics)).toEqual(['unclosed-block']);
    expect((ir as ErIR).entities[0]?.attributes).toHaveLength(1);
  });

  it('drops a stray closing brace', () => {
    const { ir, diagnostics } = parse(`${header}\n  A ||--|| B : x\n  }`);

    expect(codes(diagnostics)).toEqual(['unexpected-end']);
    expect((ir as ErIR).relationships).toHaveLength(1);
  });

  it('rejects an attribute with no name', () => {
    const { diagnostics } = parse(`${header}\n  A {\n    string\n  }`);

    expect(codes(diagnostics)).toEqual(['expected-attribute-name']);
  });

  it('rejects trailing text after an attribute', () => {
    const { diagnostics } = parse(`${header}\n  A {\n    string name PK nonsense\n  }`);

    expect(codes(diagnostics)).toEqual(['unknown-statement']);
  });

  it('rejects a half-written cardinality', () => {
    expect(codes(parse(`${header}\n  A ||-- B : x`).diagnostics)).toEqual(['unknown-relationship']);
  });

  it('names the cardinalities it expected', () => {
    expect(parse(`${header}\n  A -- B : x`).diagnostics[0]?.expected).toEqual([
      '|o',
      '||',
      '}o',
      '}|',
    ]);
  });

  it('never throws on truncated or hostile input', () => {
    const sources = [
      header,
      `${header}\n  A ||--`,
      `${header}\n  A ||--o{`,
      `${header}\n  "unterminated`,
      `${header}\n  A {`,
      `${header}\n  A {\n    "just a comment"`,
      `${header}\n  }}}`,
      `${header}\n  : label only`,
      `${header}\n  A ||--|| B :`,
      `${header}\n  p[`,
    ];

    for (const source of sources) {
      expect(() => parse(source), source).not.toThrow();
    }
  });
});

describe('parseEr unsupported constructs', () => {
  it.each([
    ['classDef highlight fill:#f00', 'unsupported-construct'],
    ['class A highlight', 'unsupported-construct'],
    ['style A fill:#f00', 'unsupported-construct'],
    ['direction LR', 'unsupported-construct'],
    ['%%{init: {"theme": "dark"}}%%', 'unsupported-directive'],
  ])('reports %s as %s and keeps parsing', (statement, code) => {
    const { ir, diagnostics } = parse(`${header}\n  ${statement}\n  A ||--|| B : x`);

    expect(codes(diagnostics)).toEqual([code]);
    expect(diagnostics[0]?.severity).toBe('info');
    expect((ir as ErIR).relationships).toHaveLength(1);
  });
});

describe('parseEr accessibility blocks', () => {
  it('reads a multi-line accDescr block', () => {
    const { ir, diagnostics } = parse(
      `${header}\n  accDescr {\n    orders and\n    their customers\n  }\n  CUSTOMER ||--o{ ORDER : places`,
    );

    expect(codes(diagnostics)).toEqual([]);
    expect(ir?.accDescr).toBe('orders and their customers');
    expect((ir as ErIR).relationships).toHaveLength(1);
  });
});

describe('parseEr robustness', () => {
  it.each(loadCorpus('er'))('$name survives 200 mutations', ({ source }) => {
    for (const mutated of mutations(source, 200, 11)) {
      expect(() => parse(mutated), mutated).not.toThrow();
    }
  });
});
