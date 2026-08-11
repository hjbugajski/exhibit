/*
 * Diagram context plus the two override channels.
 *
 * The context is split in two on purpose. `config` holds what a diagram *is* — the overrides, the
 * metrics, the id, the fit — and changes only when the call site changes; `scene` holds what was
 * drawn this render. Every leaf part (a node, an edge, a message) subscribes to `config` alone, so
 * a new scene, a new diagnostic list or a parent re-render never reaches the thousand-odd
 * subscribers a large drawing has. One combined context would have made the volatile half the
 * subscription key for all of them.
 *
 * `classNames` is the cheap one: a class per part, merged with `cn`. `components` is the full
 * escape: a part renderer receives the datum it draws, the props the default renderer would have
 * used, and the default renderer itself, so "special-case one node, delegate the rest" is
 * `datum.id === 'x' ? <mine/> : <Default/>`.
 *
 * Override safety (C29): anything that changes a node's size is a shape or a metric, never a
 * component. Layout is already finished by the time an override runs — edges are clipped to the
 * outline the shape produced and arrows are trimmed against it — so a renderer that draws outside
 * its reserved box gets edges pointing at nothing. Paint inside the box; resize through `shapes`.
 */

import { createContext, createElement, useContext } from 'react';
import type { ComponentProps, ComponentType, ElementType, ReactElement } from 'react';

import type { SceneDescription } from '@/lib/diagram/describe';
import type { DiagramMetrics } from '@/lib/diagram/metrics';
import type {
  Diagnostic,
  Scene,
  SceneCluster,
  SceneEdge,
  SceneNode,
  SceneSlice,
} from '@/lib/diagram/types';

/** `scale` fits the diagram to its container; `scroll` draws it at natural size and scrolls. */
export type DiagramFit = 'scale' | 'scroll';

/** React's element props carry no `data-*` index signature, and every part is built from them. */
export type PartProps<E extends ElementType> = ComponentProps<E> & {
  [key: `data-${string}`]: string | number | undefined;
};

export interface DiagramPartRenderProps<Datum, Props> {
  /** The scene item being drawn. */
  datum: Datum;
  /** Everything the default renderer would have put on its root element. */
  defaultProps: Props;
  /** The default renderer, pre-bound to `datum`; accepts prop overrides. */
  Default: ComponentType<Partial<Props>>;
}

export type DiagramPart<Datum, Props> = ComponentType<DiagramPartRenderProps<Datum, Props>>;

export interface DiagramComponents {
  Node?: DiagramPart<SceneNode, PartProps<'g'>>;
  NodeShape?: DiagramPart<SceneNode, PartProps<'path'>>;
  NodeLabel?: DiagramPart<SceneNode, PartProps<'text'>>;
  Edge?: DiagramPart<SceneEdge, PartProps<'g'>>;
  EdgePath?: DiagramPart<SceneEdge, PartProps<'path'>>;
  EdgeLabel?: DiagramPart<SceneEdge, PartProps<'g'>>;
  Cluster?: DiagramPart<SceneCluster, PartProps<'g'>>;
  /** State notes only — a node whose shape is `state-note`. Falls back to `Node`. */
  Note?: DiagramPart<SceneNode, PartProps<'g'>>;
  Slice?: DiagramPart<SceneSlice, PartProps<'path'>>;
}

export interface DiagramClassNames {
  root?: string;
  svg?: string;
  title?: string;
  description?: string;
  issues?: string;
  issue?: string;
  legend?: string;
  legendItem?: string;
  clusters?: string;
  cluster?: string;
  clusterBox?: string;
  clusterLabel?: string;
  edges?: string;
  edge?: string;
  edgePath?: string;
  edgeArrow?: string;
  /** The overlay layer holding every cluster title and edge label. */
  labels?: string;
  edgeLabel?: string;
  nodes?: string;
  node?: string;
  nodeShape?: string;
  nodeLabel?: string;
  slices?: string;
  slice?: string;
  sliceLabel?: string;
  participants?: string;
  participant?: string;
  participantBox?: string;
  participantLabel?: string;
  lifelines?: string;
  lifeline?: string;
  activations?: string;
  activation?: string;
  notes?: string;
  note?: string;
  noteBox?: string;
  noteLabel?: string;
  messages?: string;
  message?: string;
  messagePath?: string;
  messageArrow?: string;
  messageLabel?: string;
  frames?: string;
  frame?: string;
  frameBox?: string;
  frameTab?: string;
  frameSection?: string;
  frameTitle?: string;
  frameLabel?: string;
  /** Canvas mode: the viewport, the transformed wrapper, and the control cluster. */
  canvas?: string;
  canvasScene?: string;
  canvasControls?: string;
  canvasControl?: string;
  canvasZoom?: string;
}

/** The stable half: everything a part needs that does not change when the drawing does. */
export interface DiagramConfigValue {
  metrics: DiagramMetrics;
  components: DiagramComponents;
  classNames: DiagramClassNames;
  /** The diagram's one generated id; part ids are suffixes of it. */
  id: string;
  fit: DiagramFit;
}

/** The volatile half: the result of this render's pipeline. */
export interface DiagramSceneValue {
  source: string;
  scene: Scene | null;
  diagnostics: readonly Diagnostic[];
  family: string | null;
  /** Generated text alternative; null when there is no scene. */
  description: SceneDescription | null;
  /** Accessible name for the drawing — the `label` prop, else the generated summary. */
  accessibleName: string;
}

const ConfigContext = createContext<DiagramConfigValue | null>(null);
const SceneContext = createContext<DiagramSceneValue | null>(null);

export const DiagramConfigProvider = ConfigContext.Provider;
export const DiagramSceneProvider = SceneContext.Provider;

const OUTSIDE = 'Diagram parts must be rendered inside <Diagram.Root>.';

export function useDiagramConfig(): DiagramConfigValue {
  const value = useContext(ConfigContext);

  if (!value) {
    throw new Error(OUTSIDE);
  }

  return value;
}

export function useDiagramScene(): DiagramSceneValue {
  const value = useContext(SceneContext);

  if (!value) {
    throw new Error(OUTSIDE);
  }

  return value;
}

/*
 * The bound props reach `Default` through a context, and `Default` itself is cached per base
 * renderer. Both halves are about identity: a `Default` minted inside `renderPart` would be a new
 * component type on every render, so React would tear down and rebuild the whole default subtree
 * under an override each time — restarting transitions and dropping focus inside it. A module-level
 * "current props" holder cannot replace the context either, because `renderPart` runs for every
 * datum during the parent's render, long before any override child executes.
 *
 * The map is bounded: every `Base` is a module-level singleton.
 */
const BasePropsContext = createContext<unknown>(null);
const boundDefaults = new WeakMap<object, ComponentType<never>>();

function defaultFor<Datum, Props extends object>(
  Base: ComponentType<{ datum: Datum } & Props>,
): ComponentType<Partial<Props>> {
  const held = boundDefaults.get(Base);

  if (held) {
    return held as ComponentType<Partial<Props>>;
  }

  const Default = (props: Partial<Props>) =>
    createElement(Base, {
      ...(useContext(BasePropsContext) as { datum: Datum } & Props),
      ...props,
    });

  boundDefaults.set(Base, Default as ComponentType<never>);

  return Default;
}

/**
 * Renders one scene item through the `components` registry. Without an override the default
 * renderer draws directly; with one it receives a `Default` already bound to this datum, so both
 * `<Default />` and `<Default className="…" />` do the right thing.
 */
export function renderPart<Datum, Props extends object>(
  Override: DiagramPart<Datum, Props> | undefined,
  Base: ComponentType<{ datum: Datum } & Props>,
  datum: Datum,
  defaultProps: Props,
  key: string,
): ReactElement {
  const baseProps = { datum, ...defaultProps } as { datum: Datum } & Props;

  if (!Override) {
    return createElement(Base, { key, ...baseProps });
  }

  return createElement(
    BasePropsContext.Provider,
    { key, value: baseProps },
    createElement(Override, { datum, defaultProps, Default: defaultFor<Datum, Props>(Base) }),
  );
}
