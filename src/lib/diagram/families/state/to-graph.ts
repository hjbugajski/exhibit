/*
 * State IR -> `GraphModel`. This file is the whole state layout implementation: everything after it
 * — ranking, ordering, positioning, routing, clusters — is the shared layered engine, unchanged.
 *
 * Composite states become clusters, which are not nodes, so a transition that names one is retargeted
 * to the state inside it that the transition means: its start marker when entering, its end marker
 * when leaving, and otherwise whichever end of the member list matches the direction of travel.
 */

import { clusterEndpoint } from '../../core/graph/cluster.ts';
import type { GraphCluster, GraphEdge, GraphModel, GraphNode } from '../../core/graph/model.ts';
import type { DiagnosticSink } from '../../types.ts';
import type { StateIR, StateNode, StateNodeType } from './ir.ts';

const SHAPES: Record<StateNodeType, string> = {
  simple: 'round',
  start: 'state-start',
  end: 'state-end',
  choice: 'state-choice',
  fork: 'state-bar',
  join: 'state-bar',
  composite: 'round',
};

const NOTE_SHAPE = 'state-note';

/** Markers draw as fixed-size glyphs, so only a simple state carries text. */
function labelOf(state: StateNode): readonly string[] {
  if (state.type !== 'simple') {
    return [];
  }

  return state.label.length > 0 ? state.label : [state.id];
}

/**
 * What a marker is called in the text alternative. A `[*]` is generated, so it borrows the name of
 * the composite it belongs to — which is what a transition naming that composite was retargeted to.
 * Everything else was named by the author, even though nothing is written on the glyph.
 */
function nameOf(state: StateNode, parent: StateNode | undefined): string | undefined {
  if (state.type === 'simple') {
    return undefined;
  }

  if (state.type !== 'start' && state.type !== 'end') {
    return state.id;
  }

  if (!parent) {
    return undefined;
  }

  return (parent.label.length > 0 ? parent.label : [parent.id]).join(' ');
}

/** Direct children of each composite, in declaration order. */
function childrenOf(ir: StateIR): Map<string | null, StateNode[]> {
  const children = new Map<string | null, StateNode[]>();

  for (const state of ir.states) {
    const bucket = children.get(state.parent);

    if (bucket) {
      bucket.push(state);
    } else {
      children.set(state.parent, [state]);
    }
  }

  return children;
}

interface NoteSide {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface NoteNodes {
  /** Declared ahead of every state and transition, so ordering ties push them to the low side. */
  left: NoteSide;
  right: NoteSide;
}

/**
 * Notes are ordinary nodes on a dotted headless edge. Declaration order is what carries
 * `note left of` / `note right of` into the layout: a note has one neighbour, so nothing but the
 * order its anchor's edges are declared in decides where on its rank it lands. Declaring every left
 * note ahead of the transitions and every right note after them puts each on the side it asked for.
 *
 * Only the side is honoured. Mermaid also lifts a note beside its state rather than onto the next
 * rank, which the layered engine cannot express without a placement pass.
 */
function noteNodes(
  ir: StateIR,
  byId: ReadonlyMap<string, StateNode>,
  resolve: (id: string, role: 'source' | 'target') => string | null,
  report: DiagnosticSink,
): NoteNodes {
  const notes: NoteNodes = {
    left: { nodes: [], edges: [] },
    right: { nodes: [], edges: [] },
  };

  for (const note of ir.notes) {
    const target = byId.get(note.target);

    if (!target) {
      report.warn(
        'unknown-endpoint',
        `Note refers to '${note.target}', which is not a state.`,
        note.span,
      );

      continue;
    }

    const anchor = resolve(note.target, 'target');

    if (anchor === null) {
      continue;
    }

    const node: GraphNode = {
      id: note.id,
      label: note.label,
      shape: NOTE_SHAPE,
      classes: [],
      cluster: target.parent,
      span: note.span,
    };

    const side = note.placement === 'left' ? notes.left : notes.right;

    side.nodes.push(node);
    side.edges.push({
      id: `${note.id}-edge`,
      source: anchor,
      target: note.id,
      line: 'dotted',
      arrow: 'none',
      startArrow: 'none',
      minLen: 1,
      weight: 1,
      classes: [],
      span: note.span,
    });
  }

  return notes;
}

export function toGraph(ir: StateIR, report: DiagnosticSink): GraphModel {
  const byId = new Map(ir.states.map((state) => [state.id, state]));
  const children = childrenOf(ir);

  /** Every non-composite state under `id`, depth first, in declaration order. */
  const members = (id: string, seen = new Set<string>()): StateNode[] => {
    if (seen.has(id)) {
      return [];
    }

    seen.add(id);

    const found: StateNode[] = [];

    for (const child of children.get(id) ?? []) {
      if (child.type === 'composite') {
        found.push(...members(child.id, seen));
      } else {
        found.push(child);
      }
    }

    return found;
  };

  const marker = (inside: readonly string[], role: 'source' | 'target'): string | undefined => {
    const wanted: StateNodeType = role === 'target' ? 'start' : 'end';

    return inside.find((id) => byId.get(id)?.type === wanted);
  };

  const resolve = (id: string, role: 'source' | 'target'): string | null => {
    const state = byId.get(id);

    if (!state || state.type !== 'composite') {
      return id;
    }

    return clusterEndpoint(
      members(id).map((entry) => entry.id),
      role,
      marker,
    );
  };

  const notes = noteNodes(ir, byId, resolve, report);
  const nodes: GraphNode[] = [...notes.left.nodes];
  const clusters: GraphCluster[] = [];

  for (const state of ir.states) {
    if (state.type === 'composite') {
      const cluster: GraphCluster = {
        id: state.id,
        label: state.label.length > 0 ? state.label : [state.id],
        parent: state.parent,
        classes: [],
        span: state.span,
      };

      clusters.push(cluster);
      continue;
    }

    const node: GraphNode = {
      id: state.id,
      label: labelOf(state),
      shape: SHAPES[state.type],
      classes: [],
      cluster: state.parent,
      span: state.span,
    };
    const name = nameOf(state, state.parent === null ? undefined : byId.get(state.parent));

    if (name !== undefined) {
      node.name = name;
    }

    nodes.push(node);
  }

  nodes.push(...notes.right.nodes);

  const edges: GraphEdge[] = [...notes.left.edges];

  for (const transition of ir.transitions) {
    const source = resolve(transition.from, 'source');
    const target = resolve(transition.to, 'target');

    if (source === null || target === null) {
      report.warn(
        'empty-composite',
        `Composite state '${source === null ? transition.from : transition.to}' has no states, so a transition was dropped.`,
        transition.span,
      );

      continue;
    }

    const edge: GraphEdge = {
      id: transition.id,
      source,
      target,
      line: 'solid',
      arrow: 'arrow',
      startArrow: 'none',
      minLen: 1,
      weight: 1,
      classes: [],
      span: transition.span,
    };

    if (transition.label) {
      edge.label = transition.label;
    }

    edges.push(edge);
  }

  edges.push(...notes.right.edges);

  const model: GraphModel = {
    family: 'state',
    direction: ir.direction,
    nodes,
    edges,
    clusters,
  };

  if (ir.accTitle !== undefined) {
    model.title = ir.accTitle;
  }

  if (ir.accDescr !== undefined) {
    model.description = ir.accDescr;
  }

  return model;
}
