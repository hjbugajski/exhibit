import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { mutations } from '@testing/diagram/fuzz.ts';

import { defaultLimits } from '../../build.ts';
import { Reporter } from '../../core/diagnostics.ts';
import type { Diagnostic } from '../../types.ts';
import type { PieIR } from './ir.ts';
import { parsePie } from './parse.ts';

function parse(source: string): { ir: PieIR | null; diagnostics: readonly Diagnostic[] } {
  const report = new Reporter();

  return parsePie(source, { report, limits: defaultLimits });
}

function compact(ir: PieIR | null): unknown {
  if (!ir) {
    return null;
  }

  return {
    title: ir.title,
    showData: ir.showData,
    slices: ir.slices.map((slice) => `${slice.label} = ${slice.value}`),
    accTitle: ir.accTitle,
    accDescr: ir.accDescr,
  };
}

function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

const cases: { name: string; source: string }[] = [
  { name: 'bare header', source: 'pie' },
  { name: 'title on the header', source: 'pie title Artifact types\n  "Markdown" : 42' },
  { name: 'showData on the header', source: 'pie showData\n  "Markdown" : 42' },
  {
    name: 'showData and title on the header',
    source: 'pie showData title Artifact types\n  "Markdown" : 42',
  },
  { name: 'title on its own line', source: 'pie\n  title Artifact types\n  "Markdown" : 42' },
  {
    name: 'declaration order is preserved',
    source: 'pie\n  "Zulu" : 1\n  "Alpha" : 9\n  "Mike" : 5',
  },
  { name: 'decimal values', source: 'pie\n  "Half" : 0.5\n  "Quarter" : .25' },
  { name: 'zero values', source: 'pie\n  "None" : 0\n  "Also none" : 0' },
  { name: 'label whitespace collapses', source: 'pie\n  "  spread   out  " : 3' },
  {
    name: 'accessibility statements',
    source: 'pie\n  accTitle: Types\n  accDescr: A pie\n  "A" : 1',
  },
  { name: 'a label that looks like a keyword', source: 'pie\n  "title" : 2\n  "showData" : 3' },
  { name: 'comments and semicolons', source: 'pie %% kinds\n  "A" : 1; "B" : 2' },
];

describe('parsePie', () => {
  it.each(cases)('$name', ({ source }) => {
    expect(compact(parse(source).ir)).toMatchSnapshot();
  });
});

describe('parsePie diagnostics', () => {
  it('reports a missing header', () => {
    const { ir, diagnostics } = parse('flowchart TD');

    expect(ir).toBeNull();
    expect(codes(diagnostics)).toEqual(['missing-header']);
  });

  it('requires a quoted label', () => {
    const { ir, diagnostics } = parse('pie\n  Markdown : 42\n  "HTML" : 31');

    expect(codes(diagnostics)).toEqual(['expected-slice']);
    expect(diagnostics[0]?.expected).toEqual(['"label" : value']);
    expect((ir as PieIR).slices).toHaveLength(1);
  });

  it('requires a colon before the value', () => {
    expect(codes(parse('pie\n  "Markdown" 42').diagnostics)).toEqual(['expected-value']);
  });

  it('requires a numeric value', () => {
    expect(codes(parse('pie\n  "Markdown" : lots').diagnostics)).toEqual(['invalid-value']);
  });

  it('drops a negative slice with a warning', () => {
    const { ir, diagnostics } = parse('pie\n  "Debt" : -5\n  "Cash" : 5');

    expect(diagnostics[0]).toMatchObject({ severity: 'warning', code: 'negative-value' });
    expect((ir as PieIR).slices.map((slice) => slice.label)).toEqual(['Cash']);
  });

  it('keeps parsing after a bad row', () => {
    const { ir, diagnostics } = parse('pie\n  "A" : 1\n  oops\n  "B" : 2\n  "C" : 3');

    expect((ir as PieIR).slices).toHaveLength(3);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.span).toMatchObject({ line: 3 });
  });

  it('returns no ir when every row failed', () => {
    expect(parse('pie\n  oops\n  worse').ir).toBeNull();
  });

  it('reports a configuration directive as unsupported', () => {
    const { ir, diagnostics } = parse('pie\n  %%{init: {"theme": "dark"}}%%\n  "A" : 1');

    expect(diagnostics[0]).toMatchObject({ severity: 'info', code: 'unsupported-directive' });
    expect((ir as PieIR).slices).toHaveLength(1);
  });

  it('warns about junk on the header line', () => {
    const { ir, diagnostics } = parse('pie sideways\n  "A" : 1');

    expect(diagnostics[0]).toMatchObject({ severity: 'warning', code: 'unknown-statement' });
    expect((ir as PieIR).slices).toHaveLength(1);
  });

  it('never throws on truncated input', () => {
    for (const source of ['pie', 'pie\n  "', 'pie\n  "A" :', 'pie\n  : 1', 'pie\n  "A" : -']) {
      expect(() => parse(source), source).not.toThrow();
    }
  });
});

describe('parsePie robustness', () => {
  it.each(loadCorpus('pie'))('$name survives 200 mutations', ({ source }) => {
    for (const mutated of mutations(source, 200, 11)) {
      expect(() => parse(mutated), mutated).not.toThrow();
    }
  });
});
