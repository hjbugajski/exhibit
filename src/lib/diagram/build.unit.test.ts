import { describe, expect, it } from 'vitest';

import {
  buildDiagram,
  defaultLimits,
  layoutDiagram,
  parseDiagram,
  resolveLayoutOptions,
} from './build.ts';
import { metricsMeasurer } from './core/text/measurers.ts';
import { deferredFamily, detectFamily, readHeader } from './detect.ts';
import { builtinFamilies } from './family.ts';
import { defaultMetrics, densityPresets } from './metrics.ts';
import type { BuildOptions, DiagramFamily, DiagramIR } from './types.ts';

const options: BuildOptions = { measurer: metricsMeasurer };

/** A family that parses nothing, so the "no ir" path stays testable as real families land. */
const refuses: DiagramFamily = {
  id: 'refuses',
  detect: (header) => header.startsWith('refuses'),
  parse: (_source, ctx) => {
    ctx.report.error('unimplemented-family', 'Nothing is implemented here.');

    return { ir: null, diagnostics: ctx.report.diagnostics };
  },
  layout: () => ({ scene: null, diagnostics: [] }),
};

function codesOf(diagnostics: readonly { code: string }[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

describe('detectFamily', () => {
  it('recognizes the builtin headers', () => {
    expect(detectFamily('flowchart TD\nA --> B')).toBe('flowchart');
    expect(detectFamily('graph LR')).toBe('flowchart');
    expect(detectFamily('stateDiagram-v2')).toBe('state');
    expect(detectFamily('pie showData')).toBe('pie');
  });

  it('skips comments and blank lines before the header', () => {
    expect(readHeader('\n%% a note\nflowchart TD')).toBe('flowchart TD');
    expect(detectFamily('%% a note\nflowchart TD')).toBe('flowchart');
  });

  it('steps over a leading init directive, which is where mermaid requires it', () => {
    expect(readHeader('%%{init: {"theme":"dark"}}%%\nflowchart LR\nA --> B')).toBe('flowchart LR');
    expect(detectFamily('%%{init: {"theme":"dark"}}%%\nflowchart LR\nA --> B')).toBe('flowchart');
  });

  it('is null for an unknown or empty source', () => {
    expect(detectFamily('mindmap')).toBeNull();
    expect(detectFamily('   ')).toBeNull();
  });

  it('honours a caller family list', () => {
    expect(detectFamily('flowchart TD', [])).toBeNull();
  });
});

describe('deferredFamily', () => {
  it('names a family the table carries', () => {
    expect(deferredFamily('journey\n  title A day')).toBe('User-journey diagrams');
  });

  it('never answers with an inherited property, whatever the header word is', () => {
    for (const header of ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty']) {
      expect(deferredFamily(header)).toBeNull();
    }
  });
});

describe('parseDiagram', () => {
  it('reports an unknown diagram type with the ids it knows', () => {
    const { ir, diagnostics } = parseDiagram('doodle\n  section a');

    expect(ir).toBeNull();
    expect(diagnostics[0]?.code).toBe('unknown-diagram-type');
    expect(diagnostics[0]?.expected).toEqual(builtinFamilies.map((family) => family.id));
  });

  it('names a mermaid family it recognizes but does not draw', () => {
    for (const [source, name] of [
      ['mindmap\n  root', 'Mind maps'],
      ['journey\n  title A day', 'User-journey diagrams'],
      ['timeline\n  title A year', 'Timelines'],
    ] as const) {
      const { ir, diagnostics } = parseDiagram(source);

      expect(ir).toBeNull();
      expect(diagnostics[0]?.code).toBe('unsupported-diagram-type');
      expect(diagnostics[0]?.message).toContain(name);
    }
  });

  it('parses past a leading init directive and reports the directive itself', () => {
    const { ir, diagnostics } = parseDiagram('%%{init: {}}%%\nflowchart LR\nA --> B');

    expect(ir).not.toBeNull();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ severity: 'info', code: 'unsupported-construct' });
  });

  it('names a deferred family behind a leading init directive', () => {
    const { diagnostics } = parseDiagram('%%{init: {}}%%\nmindmap\n  root');

    expect(diagnostics[0]?.code).toBe('unsupported-diagram-type');
    expect(diagnostics[0]?.message).toContain('Mind maps');
  });

  it('refuses a source over the character limit', () => {
    const { ir, diagnostics } = parseDiagram(`flowchart TD\n${'A --> B\n'.repeat(400)}`, {
      limits: { chars: 100 },
    });

    expect(ir).toBeNull();
    expect(codesOf(diagnostics)).toEqual(['source-too-large']);
  });

  it('surfaces a family that produced no ir as diagnostics rather than throwing', () => {
    const { ir, diagnostics } = parseDiagram('refuses', { families: [refuses] });

    expect(ir).toBeNull();
    expect(codesOf(diagnostics)).toEqual(['unimplemented-family']);
  });

  it('turns a throwing family into an internal-error diagnostic', () => {
    const broken: DiagramFamily = {
      id: 'broken',
      detect: () => true,
      parse: () => {
        throw new Error('boom');
      },
      layout: () => ({ scene: null, diagnostics: [] }),
    };
    const { ir, diagnostics } = parseDiagram('broken', { families: [broken] });

    expect(ir).toBeNull();
    expect(diagnostics[0]?.code).toBe('internal-error');
    expect(diagnostics[0]?.message).toContain('boom');
  });

  it('merges diagnostics a family collected on its own', () => {
    const chatty: DiagramFamily = {
      id: 'chatty',
      detect: () => true,
      parse: () => ({
        ir: null,
        diagnostics: [{ severity: 'info', code: 'noted', message: 'noted' }],
      }),
      layout: () => ({ scene: null, diagnostics: [] }),
    };

    expect(codesOf(parseDiagram('chatty', { families: [chatty] }).diagnostics)).toEqual(['noted']);
  });
});

describe('layoutDiagram', () => {
  const ir: DiagramIR = { kind: 'nowhere', source: '' };

  it('reports an ir whose family is not registered', () => {
    const { scene, diagnostics } = layoutDiagram(ir, resolveLayoutOptions(options));

    expect(scene).toBeNull();
    expect(diagnostics[0]?.code).toBe('unknown-diagram-type');
  });

  it('turns a throwing layout into an internal-error diagnostic', () => {
    const broken: DiagramFamily = {
      id: 'nowhere',
      detect: () => true,
      parse: (_source, ctx) => ({ ir: null, diagnostics: ctx.report.diagnostics }),
      layout: () => {
        throw new Error('kaboom');
      },
    };
    const { scene, diagnostics } = layoutDiagram(ir, resolveLayoutOptions(options), [broken]);

    expect(scene).toBeNull();
    expect(diagnostics[0]?.code).toBe('internal-error');
  });
});

describe('resolveLayoutOptions', () => {
  it('fills every field so a family never sees a partial', () => {
    const resolved = resolveLayoutOptions(options);

    expect(resolved).toMatchObject({
      metrics: defaultMetrics,
      edgeShape: 'ortho',
      clusters: 'recursive',
      orderSweeps: 8,
      limits: defaultLimits,
    });
    expect(Object.keys(resolved.shapes).length).toBeGreaterThan(0);
  });

  it('lets the caller override metrics and knobs', () => {
    const resolved = resolveLayoutOptions({
      ...options,
      metrics: { rankSep: 99 },
      edgeShape: 'straight',
    });

    expect(resolved.metrics.rankSep).toBe(99);
    expect(resolved.metrics.nodeSep).toBe(defaultMetrics.nodeSep);
    expect(resolved.edgeShape).toBe('straight');
  });

  it('applies a density preset under explicit metrics', () => {
    const resolved = resolveLayoutOptions({
      ...options,
      density: 'compact',
      metrics: { nodeSep: 5 },
    });

    expect(resolved.metrics.nodeSep).toBe(5);
    expect(resolved.metrics.rankSep).toBe(densityPresets.compact.rankSep);
  });
});

describe('buildDiagram', () => {
  it('returns the detected family even when nothing parsed', () => {
    const result = buildDiagram('refuses', { ...options, families: [refuses] });

    expect(result).toMatchObject({ scene: null, family: 'refuses' });
    expect(codesOf(result.diagnostics)).toEqual(['unimplemented-family']);
  });

  it('builds a scene for a family that is implemented', () => {
    const result = buildDiagram('flowchart TD\nA --> B', options);

    expect(result).toMatchObject({ family: 'flowchart', diagnostics: [] });
    expect(result.scene?.kind).toBe('graph');
  });

  it('reports a null family for an unrecognized source', () => {
    expect(buildDiagram('nonsense', options)).toMatchObject({ scene: null, family: null });
  });

  it('never throws on hostile input', () => {
    const sources = ['', '   ', '%%', 'flowchart', 'pie\n"a" :', '\u0000\uFFFF', 'graph TD\nA-->'];

    for (const source of sources) {
      expect(() => buildDiagram(source, options)).not.toThrow();
    }
  });
});
