/*
 * The declared caps (nodes, edges, cluster depth) do not bound runtime: a long edge is broken into
 * one virtual node per rank it crosses, so a graph well inside every declared cap can present the
 * ordering and positioning passes — both superlinear — with tens of thousands of nodes.
 *
 * These tests assert the counter, never a duration: wall clock on a CI runner is noise, and the
 * number of normalized nodes is exactly what the cost is a function of.
 */

import { describe, expect, it } from 'vitest';

import { layoutOptions, model } from '@testing/diagram/graph-fixtures.ts';

import { defaultLimits } from '../../build.ts';
import { layoutGraph } from './layout-graph.ts';
import type { GraphModel } from './model.ts';

/**
 * A chain of `size` nodes plus one edge from the first node to every node past its neighbour. Each
 * of those spans a growing number of ranks, so the normalized count grows with the square of a
 * declared size that stays trivially small.
 */
function ladder(size: number): GraphModel {
  const nodes = Array.from({ length: size }, (_, index) => `n${index}`);
  const edges = nodes.slice(1).map((to, index) => ({ from: nodes[index] as string, to }));

  for (let index = 2; index < size; index += 1) {
    edges.push({ from: nodes[0] as string, to: nodes[index] as string });
  }

  return model({ nodes, edges });
}

function complaint(built: GraphModel, layoutNodes: number) {
  const result = layoutGraph(built, layoutOptions({ limits: { ...defaultLimits, layoutNodes } }));

  return {
    scene: result.scene,
    codes: result.diagnostics.map((diagnostic) => diagnostic.code),
    message: result.diagnostics.find((diagnostic) => diagnostic.code === 'graph-too-complex')
      ?.message,
  };
}

/** The count the engine reports once it has normalized everything and found the budget blown. */
function normalizedCount(built: GraphModel): number {
  return Number(/at least (\d+) layout nodes/.exec(complaint(built, 1).message ?? '')?.[1]);
}

describe('the layout-node budget', () => {
  it('counts normalized nodes, not declared ones', () => {
    // 40 nodes and 77 edges — an order of magnitude inside `nodes: 400` / `edges: 800`.
    expect(ladder(40).nodes).toHaveLength(40);
    expect(ladder(40).edges).toHaveLength(77);
    expect(normalizedCount(ladder(40))).toBe(781);
  });

  it('grows superlinearly in the declared size, which is why the declared caps do not bound it', () => {
    expect(normalizedCount(ladder(80))).toBe(3161);
  });

  it('draws whatever fits the budget', () => {
    const result = layoutGraph(ladder(40), layoutOptions());

    expect(result.scene).not.toBeNull();
    expect(result.diagnostics).toEqual([]);
  });

  it('refuses with one error and no scene once the budget is blown', () => {
    const { scene, codes, message } = complaint(ladder(40), 500);

    expect(scene).toBeNull();
    expect(codes).toEqual(['graph-too-complex']);
    expect(message).toContain('the limit is 500');
    // The knob is named, or the number is folklore.
    expect(message).toContain('limits.layoutNodes');
  });

  it('leaves the default high enough for a graph at the declared node cap to draw', () => {
    const chain = model({
      nodes: Array.from({ length: 400 }, (_, index) => `n${index}`),
      edges: Array.from({ length: 399 }, (_, index) => ({
        from: `n${index}`,
        to: `n${index + 1}`,
      })),
    });

    expect(layoutGraph(chain, layoutOptions()).scene).not.toBeNull();
  });
});
