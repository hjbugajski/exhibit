/*
 * Exercised through the engine rather than against `reportExtent` directly: the claim is that a
 * scene nothing else objects to still gets flagged, which only means something end to end.
 */

import { describe, expect, it } from 'vitest';

import { layoutOptions, model } from '@testing/diagram/graph-fixtures.ts';

import { layoutGraph } from './graph/layout-graph.ts';

function codes(built: Parameters<typeof layoutGraph>[0], options = layoutOptions()) {
  return layoutGraph(built, options).diagnostics.map((diagnostic) => diagnostic.code);
}

function chain(size: number) {
  const nodes = Array.from({ length: size }, (_, index) => `n${index}`);

  return model({
    nodes,
    edges: nodes.slice(1).map((to, index) => ({ from: nodes[index] as string, to })),
  });
}

describe('extent guards', () => {
  it('says nothing about a drawing that fits a column', () => {
    expect(codes(chain(6))).toEqual([]);
  });

  it('warns when the drawing is far taller than it is wide', () => {
    const result = layoutGraph(chain(120), layoutOptions());
    const warning = result.diagnostics.find((diagnostic) => diagnostic.code === 'extreme-extent');

    expect(result.scene).not.toBeNull();
    expect(warning?.severity).toBe('warning');
    expect(warning?.message).toMatch(/\d+:1/);
    // A diagnostic, not a behaviour: the scene is still drawn at the size it came out.
    expect((result.scene?.size.height ?? 0) / (result.scene?.size.width ?? 1)).toBeGreaterThan(12);
  });

  it('shortens a runaway word and says how many lines it cut', () => {
    const result = layoutGraph(
      model({ nodes: [{ id: 'a', label: 'x'.repeat(10_000) }] }),
      layoutOptions(),
    );
    const warning = result.diagnostics.find((diagnostic) => diagnostic.code === 'label-truncated');
    const label = (result.scene?.nodes[0]?.label.lines[0] ?? '') as string;

    expect(warning?.severity).toBe('warning');
    expect(warning?.message).toContain('1 label line');
    expect(label.endsWith('…')).toBe(true);
    expect(label.length).toBeLessThan(500);
    // 200 wrap width x4, plus the node's own padding.
    expect(result.scene?.size.width ?? 0).toBeLessThan(900);
  });

  it('leaves a label inside the ceiling exactly as written', () => {
    const text = 'y'.repeat(40);
    const result = layoutGraph(model({ nodes: [{ id: 'a', label: text }] }), layoutOptions());

    expect(result.scene?.nodes[0]?.label.lines).toEqual([text]);
    expect(result.diagnostics).toEqual([]);
  });
});
