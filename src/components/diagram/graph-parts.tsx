/*
 * SVG for the graph families (flowchart and state — one scene shape, one renderer).
 *
 * Nothing here emits paint: every element carries `data-part` plus the author intent the scene
 * recorded (`data-shape`, `data-line`, `data-arrow`, `data-class`) and `diagram.css` decides how it
 * looks. Placement uses the CSS `transform` property rather than the SVG attribute for the two
 * things drawn origin-centred (nodes and edge labels); clusters and paths already carry absolute
 * coordinates, so they get none.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';

import { round2 } from '@/lib/diagram/core/geometry/path';
import { labelPlatePadding } from '@/lib/diagram/metrics';
import type { Scene, SceneCluster, SceneEdge, SceneNode } from '@/lib/diagram/types';

import type { PartProps } from './diagram-context';
import { renderPart, useDiagramConfig } from './diagram-context';
import { tspans } from './svg-text';

function classAttr(classes: readonly string[]): string | undefined {
  return classes.length > 0 ? classes.join(' ') : undefined;
}

function translate(x: number, y: number): { transform: string } {
  return { transform: `translate(${round2(x)}px, ${round2(y)}px)` };
}

// -------------------------------------------------------------------------------------- nodes

function NodeShapeBase({ datum: _datum, ...props }: { datum: SceneNode } & PartProps<'path'>) {
  return <path {...props} />;
}

function NodeLabelBase({ datum: _datum, ...props }: { datum: SceneNode } & PartProps<'text'>) {
  return <text {...props} />;
}

function NodeBase({ datum, ...props }: { datum: SceneNode } & PartProps<'g'>) {
  const { components, classNames } = useDiagramConfig();

  return (
    <g {...props}>
      {renderPart(
        components.NodeShape,
        NodeShapeBase,
        datum,
        { 'data-part': 'node-shape', d: datum.outline, className: classNames.nodeShape },
        'shape',
      )}
      {datum.label.lines.length > 0 &&
        renderPart(
          components.NodeLabel,
          NodeLabelBase,
          datum,
          {
            'data-part': 'node-label',
            textAnchor: 'middle',
            className: classNames.nodeLabel,
            children: tspans(datum.label, 0, 0),
          },
          'label',
        )}
    </g>
  );
}

function Nodes({ nodes }: { nodes: readonly SceneNode[] }) {
  const { components, classNames } = useDiagramConfig();

  if (nodes.length === 0) {
    return null;
  }

  return (
    <g data-part="nodes" className={classNames.nodes}>
      {nodes.map((node) =>
        renderPart(
          node.shape === 'state-note' ? (components.Note ?? components.Node) : components.Node,
          NodeBase,
          node,
          {
            'data-part': 'node',
            'data-id': node.id,
            'data-shape': node.shape,
            'data-class': classAttr(node.classes),
            className: classNames.node,
            style: translate(node.x, node.y),
          },
          node.id,
        ),
      )}
    </g>
  );
}

// -------------------------------------------------------------------------------------- edges

function EdgePathBase({ datum: _datum, ...props }: { datum: SceneEdge } & PartProps<'path'>) {
  return <path {...props} />;
}

/**
 * The stroke is cut around this box in the scene, so the background rect paints nothing by default:
 * it is there for the fallback the engine flags with `labelPlate` (a stroke too short to gap) and
 * for consumers who want a plate anyway. Its geometry is the gap's, inset so it never reaches the
 * ink the gap left standing.
 */
function EdgeLabelBase({ datum, ...props }: { datum: SceneEdge } & PartProps<'g'>) {
  const { metrics } = useDiagramConfig();
  const box = datum.label?.box;

  if (!box) {
    return null;
  }

  const pad = labelPlatePadding(metrics);

  return (
    <g {...props}>
      <rect
        data-part="edge-label-bg"
        data-plate={datum.labelPlate ? '' : undefined}
        x={round2(-box.width / 2 - pad)}
        y={round2(-box.height / 2 - pad)}
        width={round2(box.width + pad * 2)}
        height={round2(box.height + pad * 2)}
        rx={round2(Math.min(pad * 2, metrics.cornerRadius))}
      />
      <text data-part="edge-label-text" textAnchor="middle">
        {tspans(box, 0, 0)}
      </text>
    </g>
  );
}

function arrowPath(
  edge: SceneEdge,
  end: 'source' | 'target',
  className: string | undefined,
): ReactNode {
  const d = end === 'target' ? edge.arrowD : edge.startArrowD;
  const kind = end === 'target' ? edge.arrow : edge.startArrow;

  if (!d || kind === 'none') {
    return null;
  }

  return (
    <path data-part="edge-arrow" data-arrow={kind} data-end={end} d={d} className={className} />
  );
}

function EdgeBase({ datum, ...props }: { datum: SceneEdge } & PartProps<'g'>) {
  const { components, classNames } = useDiagramConfig();

  return (
    <g {...props}>
      {renderPart(
        components.EdgePath,
        EdgePathBase,
        datum,
        { 'data-part': 'edge-path', d: datum.d, className: classNames.edgePath },
        'path',
      )}
      {arrowPath(datum, 'target', classNames.edgeArrow)}
      {arrowPath(datum, 'source', classNames.edgeArrow)}
    </g>
  );
}

function Edges({ edges }: { edges: readonly SceneEdge[] }) {
  const { components, classNames } = useDiagramConfig();

  if (edges.length === 0) {
    return null;
  }

  return (
    <g data-part="edges" className={classNames.edges}>
      {edges.map((edge) =>
        renderPart(
          components.Edge,
          EdgeBase,
          edge,
          {
            'data-part': 'edge',
            'data-id': edge.id,
            'data-source': edge.source,
            'data-target': edge.target,
            'data-line': edge.line,
            'data-arrow': edge.arrow,
            'data-start-arrow': edge.startArrow,
            'data-reversed': edge.reversed ? '' : undefined,
            'data-class': classAttr(edge.classes),
            className: classNames.edge,
          },
          edge.id,
        ),
      )}
    </g>
  );
}

// ----------------------------------------------------------------------------------- clusters

/**
 * Cluster geometry is absolute, so nesting groups is free — no transform to compound — and the DOM
 * keeps the containment the source declared. The title is not drawn here: it belongs to the label
 * layer, above every stroke.
 */
function ClusterBase({ datum, ...props }: { datum: SceneCluster } & PartProps<'g'>) {
  const { components, classNames, metrics } = useDiagramConfig();

  return (
    <g {...props}>
      <rect
        data-part="cluster-box"
        x={round2(datum.box.x)}
        y={round2(datum.box.y)}
        width={round2(datum.box.width)}
        height={round2(datum.box.height)}
        rx={metrics.cornerRadius}
        className={classNames.clusterBox}
      />
      {datum.children.map((child) =>
        renderPart(
          components.Cluster,
          ClusterBase,
          child,
          clusterProps(child, classNames.cluster),
          child.id,
        ),
      )}
    </g>
  );
}

function clusterProps(cluster: SceneCluster, className: string | undefined): PartProps<'g'> {
  return {
    'data-part': 'cluster',
    'data-id': cluster.id,
    'data-depth': cluster.depth,
    'data-class': classAttr(cluster.classes),
    className,
  };
}

function Clusters({ clusters }: { clusters: readonly SceneCluster[] }) {
  const { components, classNames } = useDiagramConfig();

  if (clusters.length === 0) {
    return null;
  }

  return (
    <g data-part="clusters" className={classNames.clusters}>
      {clusters.map((cluster) =>
        renderPart(
          components.Cluster,
          ClusterBase,
          cluster,
          clusterProps(cluster, classNames.cluster),
          cluster.id,
        ),
      )}
    </g>
  );
}

// ------------------------------------------------------------------------------------- labels

/** Cluster titles, outermost first — the drawing order the tree already encodes. */
function titledClusters(clusters: readonly SceneCluster[], into: SceneCluster[]): SceneCluster[] {
  for (const cluster of clusters) {
    if (cluster.title && cluster.title.box.lines.length > 0) {
      into.push(cluster);
    }

    titledClusters(cluster.children, into);
  }

  return into;
}

function ClusterLabel({ datum }: { datum: SceneCluster }) {
  const { classNames, metrics } = useDiagramConfig();
  const title = datum.title as NonNullable<SceneCluster['title']>;
  const pad = metrics.labelGap;

  return (
    <g
      data-part="cluster-label"
      data-id={datum.id}
      data-depth={datum.depth}
      data-class={classAttr(datum.classes)}
      className={classNames.clusterLabel}
    >
      <rect
        data-part="cluster-label-bg"
        x={round2(title.x - title.box.width / 2 - pad)}
        y={round2(title.y - title.box.height / 2 - pad)}
        width={round2(title.box.width + pad * 2)}
        height={round2(title.box.height + pad * 2)}
        rx={round2(Math.min(pad * 2, metrics.cornerRadius))}
      />
      <text data-part="cluster-label-text" textAnchor="middle">
        {tspans(title.box, title.x, title.y)}
      </text>
    </g>
  );
}

/**
 * Every label in one layer, drawn after the last stroke. A label that another edge can be painted
 * over is not a label, and a cluster title is exactly the place cross-boundary edges converge —
 * both were struck through while they lived inside their own groups.
 */
function Labels({
  clusters,
  edges,
}: {
  clusters: readonly SceneCluster[];
  edges: readonly SceneEdge[];
}) {
  const { components, classNames } = useDiagramConfig();
  const titles = titledClusters(clusters, []);
  const labelled = edges.filter((edge) => edge.label);

  if (titles.length === 0 && labelled.length === 0) {
    return null;
  }

  return (
    <g data-part="labels" className={classNames.labels}>
      {titles.map((cluster) => (
        <ClusterLabel datum={cluster} key={cluster.id} />
      ))}
      {labelled.map((edge) =>
        renderPart(
          components.EdgeLabel,
          EdgeLabelBase,
          edge,
          {
            'data-part': 'edge-label',
            'data-id': edge.id,
            // `~~~` reserves space and draws nothing; its label must vanish with it.
            'data-line': edge.line,
            'data-class': classAttr(edge.classes),
            className: classNames.edgeLabel,
            style: translate(edge.label?.x ?? 0, edge.label?.y ?? 0),
          },
          edge.id,
        ),
      )}
    </g>
  );
}

/**
 * Painter's order: cluster fills at the bottom, then edges, then every label, then nodes.
 *
 * Memoized on the scene: a parent re-render recreates the element tree above it, and rebuilding a
 * few thousand `<g>`s for an unchanged drawing is the whole cost of a keystroke in a live editor.
 * The leaves below read the config context only, so this holds until the drawing actually changes.
 */
export const GraphView = memo(function GraphView({ scene }: { scene: Scene }) {
  if (scene.kind !== 'graph') {
    return null;
  }

  return (
    <>
      <Clusters clusters={scene.clusters} />
      <Edges edges={scene.edges} />
      <Labels clusters={scene.clusters} edges={scene.edges} />
      <Nodes nodes={scene.nodes} />
    </>
  );
});
