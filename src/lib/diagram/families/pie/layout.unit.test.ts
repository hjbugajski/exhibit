import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { goldenScene } from '@testing/diagram/golden.ts';

import { buildDiagram, defaultLimits, resolveLayoutOptions } from '../../build.ts';
import { metricsMeasurer } from '../../core/text/measurers.ts';
import { resolveMetrics } from '../../metrics.ts';
import type { BuildOptions, Diagnostic, PieScene } from '../../types.ts';
import type { PieIR, PieSlice } from './ir.ts';
import { PIE_SERIES_COUNT, layoutPie } from './layout.ts';

const options: BuildOptions = { measurer: metricsMeasurer };
const layout = resolveLayoutOptions(options);
const metrics = resolveMetrics();
const corpus = loadCorpus('pie');

const span = { offset: 0, length: 0, line: 1, column: 1 };

function ir(values: readonly (readonly [string, number])[], extra: Partial<PieIR> = {}): PieIR {
  const slices: PieSlice[] = values.map(([label, value]) => ({ label, value, span }));

  return { kind: 'pie', source: '', showData: false, slices, ...extra };
}

function laid(built: PieIR): { scene: PieScene; diagnostics: readonly Diagnostic[] } {
  const result = layoutPie(built, layout);

  expect(result.scene, JSON.stringify(result.diagnostics)).not.toBeNull();

  return { scene: result.scene as PieScene, diagnostics: result.diagnostics };
}

describe('layoutPie geometry', () => {
  const scene = laid(
    ir([
      ['Markdown', 42],
      ['HTML', 31],
      ['Spec', 27],
    ]),
  ).scene;

  it('sweeps clockwise from twelve o clock, without gaps', () => {
    expect(scene.slices[0]?.startAngle).toBeCloseTo(-Math.PI / 2, 9);

    for (const [index, slice] of scene.slices.entries()) {
      expect(slice.endAngle).toBeGreaterThan(slice.startAngle);

      if (index > 0) {
        expect(slice.startAngle).toBeCloseTo(scene.slices[index - 1]?.endAngle as number, 9);
      }
    }

    expect(scene.slices.at(-1)?.endAngle).toBeCloseTo(-Math.PI / 2 + Math.PI * 2, 9);
  });

  it('keeps declaration order and gives each slice its own swatch', () => {
    expect(scene.slices.map((slice) => slice.label)).toEqual(['Markdown', 'HTML', 'Spec']);
    expect(scene.slices.map((slice) => slice.swatchIndex)).toEqual([0, 1, 2]);
  });

  it('fractions sum to one', () => {
    expect(scene.slices.reduce((sum, slice) => sum + slice.fraction, 0)).toBeCloseTo(1, 9);
  });

  it('sizes the scene to the circle plus padding', () => {
    const expected = scene.radius * 2 + metrics.padding * 2;

    expect(scene.size).toEqual({ width: expected, height: expected });
    expect(scene.center).toEqual({
      x: metrics.padding + scene.radius,
      y: metrics.padding + scene.radius,
    });
  });

  it('emits finite arc paths', () => {
    for (const slice of scene.slices) {
      expect(slice.d).not.toMatch(/NaN|Infinity/);
      expect(slice.d.startsWith('M')).toBe(true);
    }
  });

  it('lays out identically twice', () => {
    expect(goldenScene(scene)).toEqual(
      goldenScene(
        laid(
          ir([
            ['Markdown', 42],
            ['HTML', 31],
            ['Spec', 27],
          ]),
        ).scene,
      ),
    );
  });

  it('wraps swatches past the palette size', () => {
    const many = laid(
      ir(Array.from({ length: PIE_SERIES_COUNT + 2 }, (_, index) => [`s${index}`, 1] as const)),
    ).scene;

    expect(many.slices.at(-1)?.swatchIndex).toBe(1);
  });
});

describe('layoutPie labels', () => {
  it('puts a label inside a slice that has room for it', () => {
    const scene = laid(
      ir([
        ['Yes', 90],
        ['No', 10],
      ]),
    ).scene;
    const big = scene.slices[0] as (typeof scene.slices)[number];

    expect(big.labelBox?.lines).toEqual(['Yes']);
    expect(
      Math.hypot(
        (big.labelPoint?.x as number) - scene.center.x,
        (big.labelPoint?.y as number) - scene.center.y,
      ),
    ).toBeLessThan(scene.radius);
  });

  it('demotes a label that does not fit to the legend only', () => {
    const scene = laid(
      ir([
        ['A very long slice label indeed', 2],
        ['Everything else', 98],
      ]),
    ).scene;

    expect(scene.slices[0]?.labelBox).toBeUndefined();
    expect(scene.slices[0]?.labelPoint).toBeUndefined();
    expect(scene.legend[0]?.label).toBe('A very long slice label indeed');
  });

  it('always lists every slice in the legend', () => {
    const scene = laid(
      ir([
        ['A', 1],
        ['B', 2],
      ]),
    ).scene;

    expect(scene.legend).toEqual([
      { id: 'slice-0', label: 'A', value: 1, fraction: 1 / 3, swatchIndex: 0 },
      { id: 'slice-1', label: 'B', value: 2, fraction: 2 / 3, swatchIndex: 1 },
    ]);
  });
});

describe('layoutPie degenerate inputs', () => {
  it('draws a single slice as a full circle', () => {
    const scene = laid(ir([['Everything', 7]])).scene;

    expect(scene.slices).toHaveLength(1);
    expect(scene.slices[0]?.fraction).toBe(1);
    expect(scene.slices[0]?.d).not.toMatch(/NaN/);
  });

  it('reports an empty chart and collapses the circle', () => {
    const { scene, diagnostics } = laid(ir([]));

    expect(diagnostics[0]).toMatchObject({ severity: 'warning', code: 'empty-diagram' });
    expect(scene).toMatchObject({ radius: 0, slices: [], legend: [] });
    expect(scene.size).toEqual({
      width: metrics.padding * 2,
      height: metrics.padding * 2,
    });
  });

  it('draws no arcs when every value is zero but keeps the legend', () => {
    const { scene, diagnostics } = laid(
      ir([
        ['None', 0],
        ['Also none', 0],
      ]),
    );

    expect(diagnostics[0]).toMatchObject({ severity: 'warning', code: 'zero-total' });
    expect(scene.slices).toEqual([]);
    expect(scene.legend.map((item) => item.fraction)).toEqual([0, 0]);
  });

  it('skips a zero slice among positive ones without shifting the others', () => {
    const scene = laid(
      ir([
        ['A', 1],
        ['Nothing', 0],
        ['B', 1],
      ]),
    ).scene;

    expect(scene.slices.map((slice) => slice.label)).toEqual(['A', 'B']);
    expect(scene.slices[1]?.startAngle).toBeCloseTo(scene.slices[0]?.endAngle as number, 9);
    expect(scene.legend).toHaveLength(3);
  });

  it('refuses a chart over the slice limit', () => {
    const result = layoutPie(
      ir([
        ['a', 1],
        ['b', 1],
      ]),
      {
        ...layout,
        limits: { ...defaultLimits, nodes: 1 },
      },
    );

    expect(result.scene).toBeNull();
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'too-many-nodes' });
  });

  it('prefers the pie title over accTitle for the scene title', () => {
    const scene = laid(ir([['A', 1]], { title: 'Kinds', accTitle: 'Ignored' })).scene;

    expect(scene.title).toBe('Kinds');
  });

  it('falls back to accTitle and carries accDescr', () => {
    const scene = laid(ir([['A', 1]], { accTitle: 'Kinds', accDescr: 'One slice' })).scene;

    expect(scene).toMatchObject({ title: 'Kinds', description: 'One slice' });
  });
});

describe('pie end to end', () => {
  it('has fixtures to run', () => {
    expect(corpus.length).toBeGreaterThan(1);
  });

  it.each(corpus)('$name matches its golden scene', ({ source }) => {
    const result = buildDiagram(source, options);

    expect(result.family).toBe('pie');
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(goldenScene(result.scene as PieScene)).toMatchSnapshot();
  });
});
