import { describe, expect, it } from 'vitest';

import { cluster, model } from '@testing/diagram/graph-fixtures.ts';

import { defaultMetrics } from '../../metrics.ts';
import {
  buildClusterTree,
  clusterIdOf,
  clusterPads,
  compositeId,
  finalTopSide,
  isCompositeId,
  nodesAtLevel,
  resolveLevels,
  titleBand,
  titleRect,
} from './cluster.ts';

const m = defaultMetrics;

describe('composite ids', () => {
  it('round-trips a cluster id without colliding with node ids', () => {
    expect(isCompositeId(compositeId('group'))).toBe(true);
    expect(clusterIdOf(compositeId('group'))).toBe('group');
    expect(isCompositeId('group')).toBe(false);
  });
});

describe('buildClusterTree', () => {
  it('nests children under their parents in declaration order', () => {
    const tree = buildClusterTree([cluster('outer'), cluster('inner', 'outer'), cluster('other')]);

    expect(tree.childrenOf.get(null)?.map((entry) => entry.id)).toEqual(['outer', 'other']);
    expect(tree.childrenOf.get('outer')?.map((entry) => entry.id)).toEqual(['inner']);
    expect(tree.depthOf.get('inner')).toBe(2);
    expect(tree.maxDepth).toBe(2);
  });

  it('reparents a cluster whose parent does not exist', () => {
    const tree = buildClusterTree([cluster('orphan', 'missing')]);

    expect(tree.childrenOf.get(null)?.map((entry) => entry.id)).toEqual(['orphan']);
    expect(tree.maxDepth).toBe(1);
  });

  it('breaks a parent cycle instead of recursing forever', () => {
    const tree = buildClusterTree([cluster('a', 'b'), cluster('b', 'a')]);
    const roots = tree.childrenOf.get(null) ?? [];

    expect(roots).toHaveLength(1);
    expect(tree.maxDepth).toBeLessThanOrEqual(2);
  });

  it('treats a self-parent as a root', () => {
    const tree = buildClusterTree([cluster('a', 'a')]);

    expect(tree.childrenOf.get(null)?.map((entry) => entry.id)).toEqual(['a']);
  });
});

describe('resolveLevels', () => {
  const built = model({
    nodes: [
      'top',
      { id: 'a', cluster: 'outer' },
      { id: 'b', cluster: 'inner' },
      { id: 'c', cluster: 'inner' },
    ],
    edges: [
      { from: 'top', to: 'b' },
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ],
    clusters: [cluster('outer'), cluster('inner', 'outer')],
  });
  const tree = buildClusterTree(built.clusters);
  const levels = resolveLevels(built, tree);

  it('lays an edge out at the lowest cluster holding both ends', () => {
    expect(levels.edgeLevel.get('top->b#0')).toBeNull();
    expect(levels.edgeLevel.get('a->b#1')).toBe('outer');
    expect(levels.edgeLevel.get('b->c#2')).toBe('inner');
  });

  it('attaches a buried endpoint to the composite that contains it', () => {
    expect(levels.entityOf.get('top->b#0')).toEqual({
      source: 'top',
      target: compositeId('outer'),
    });
    expect(levels.entityOf.get('a->b#1')).toEqual({
      source: 'a',
      target: compositeId('inner'),
    });
    expect(levels.entityOf.get('b->c#2')).toEqual({ source: 'b', target: 'c' });
  });

  it('places each node at exactly one level', () => {
    expect(nodesAtLevel(built, levels, null).map((node) => node.id)).toEqual(['top']);
    expect(nodesAtLevel(built, levels, 'outer').map((node) => node.id)).toEqual(['a']);
    expect(nodesAtLevel(built, levels, 'inner').map((node) => node.id)).toEqual(['b', 'c']);
  });

  it('drops a node into the top level when its cluster is unknown', () => {
    const stray = model({ nodes: [{ id: 'x', cluster: 'nope' }] });
    const resolved = resolveLevels(stray, buildClusterTree([]));

    expect(resolved.nodeLevel.get('x')).toBeNull();
  });
});

describe('clusterPads', () => {
  it('reserves the title band on whichever layout side becomes the final top', () => {
    expect(finalTopSide('TB')).toBe('top');
    expect(finalTopSide('BT')).toBe('bottom');
    expect(finalTopSide('LR')).toBe('left');
    expect(finalTopSide('RL')).toBe('left');

    expect(clusterPads('BT', m, 24)).toEqual({
      top: m.clusterPadding,
      right: m.clusterPadding,
      bottom: m.clusterPadding * 1.5 + 24,
      left: m.clusterPadding,
    });
    expect(clusterPads('LR', m, 24).left).toBe(m.clusterPadding * 1.5 + 24);
  });

  it('keeps a whole padding clear below the band, and half of one above it', () => {
    const pad = clusterPads('TB', m, 24).top;

    expect(pad - (m.clusterPadding / 2 + 24)).toBe(m.clusterPadding);
  });

  it('pads evenly when the cluster has no title', () => {
    expect(clusterPads('TB', m, 0)).toEqual({
      top: m.clusterPadding,
      right: m.clusterPadding,
      bottom: m.clusterPadding,
      left: m.clusterPadding,
    });
  });
});

describe('titleBand', () => {
  it('reserves the plate around the glyphs, not the glyphs alone', () => {
    expect(titleBand(m, { width: 40, height: 40 })).toBe(40 + m.labelGap * 2);
  });

  it('never goes under the metric, however short the title is', () => {
    expect(titleBand(m, { width: 40, height: 1 })).toBe(m.clusterTitleHeight);
  });
});

describe('titleRect', () => {
  const box = { x: 100, y: 200, width: 300, height: 400 };

  it('is the glyphs plus the gap the renderer plates around them', () => {
    const title = { width: 60, height: 16 };
    const plate = titleRect(box, title, m);

    expect(plate.width).toBe(title.width + m.labelGap * 2);
    expect(plate.height).toBe(title.height + m.labelGap * 2);
  });

  it('takes the leading edge of the band, a padding in from the border', () => {
    const plate = titleRect(box, { width: 60, height: 16 }, m);

    expect(plate.x + m.labelGap).toBe(box.x + m.clusterPadding);
  });

  it('centres in the band the padding maths reserved', () => {
    const title = { width: 60, height: 16 };
    const plate = titleRect(box, title, m);
    const band = m.clusterPadding + titleBand(m, title);

    expect(plate.y - box.y).toBeCloseTo(band - (plate.y - box.y) - plate.height, 10);
  });

  it('centres a title too wide for its box rather than overhanging one side', () => {
    const title = { width: 400, height: 16 };
    const plate = titleRect(box, title, m);

    expect(plate.x + plate.width / 2).toBe(box.x + box.width / 2);
  });
});
