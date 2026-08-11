/*
 * Family id -> SVG view. The map is the React half of the family seam: a third-party family is
 * `familyViews.myFamily = MyView` (or a `views` prop on `Diagram.Svg`), and the core stays
 * React-free either way. Scene kind is the fallback, so a family that reuses `GraphScene` renders
 * without registering anything.
 */

import type { ComponentType } from 'react';

import type { Scene } from '@/lib/diagram/types';

import { GraphView } from './graph-parts';
import { PieView } from './pie-parts';
import { SequenceView } from './sequence-parts';

export type DiagramFamilyView = ComponentType<{ scene: Scene }>;

export const familyViews: Readonly<Record<string, DiagramFamilyView>> = {
  flowchart: GraphView,
  sequence: SequenceView,
  state: GraphView,
  pie: PieView,
};

const BY_KIND: Readonly<Record<Scene['kind'], DiagramFamilyView>> = {
  graph: GraphView,
  pie: PieView,
  sequence: SequenceView,
};

/**
 * A `views` prop *adds to* the registry rather than replacing it: the two extension points are
 * documented as independent, and a consumer registering one more family would otherwise drop every
 * third-party view already in `familyViews`.
 */
export function resolveFamilyView(
  scene: Scene,
  views?: Readonly<Record<string, DiagramFamilyView>>,
): DiagramFamilyView {
  return views?.[scene.family] ?? familyViews[scene.family] ?? BY_KIND[scene.kind];
}
