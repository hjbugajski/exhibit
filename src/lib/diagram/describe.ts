/*
 * The text alternative. A diagram is `role="img"`: the summary is its accessible name and the detail
 * lines are the sr-only structure that replaces the picture, following the `chart-inner.tsx`
 * precedent of a hidden table beside a chart.
 *
 * Everything here reads the `Scene` only — the description of a diagram is a property of what was
 * drawn, not of the source it came from.
 *
 * The detail list is capped. One line per edge is fine at twenty nodes and hostile at four hundred:
 * a diagram at the declared caps serialized 1.2 MB of `<li>` into the page and handed a screen
 * reader an 801-item list of "n17 leads to n204." Past the cap the tail is replaced by a count, and
 * the summary picks up the shape the tail was carrying — how many separate parts there are, where
 * the flow starts and ends, which node everything goes through. The full structure stays reachable:
 * a scene this size is exactly the case a binding renders its source fallback beside.
 */

import type {
  GraphScene,
  PieScene,
  Scene,
  SceneCluster,
  SceneEdge,
  SceneNode,
  SequenceScene,
} from './types.ts';

export interface SceneDescription {
  /** One sentence naming the diagram and its size. */
  summary: string;
  /** Ordered structure lines; the React layer renders them as a list. */
  details: readonly string[];
}

/** Marker shapes carry no text, so they are named by what they mean. */
const SHAPE_NAMES: Record<string, string> = {
  'state-start': 'start',
  'state-end': 'end',
  'state-choice': 'choice',
  'state-bar': 'fork or join',
  'state-note': 'note',
};

/**
 * How a sequence frame reads aloud: what opens it, what starts each later section, what closes it.
 * The drawn tab carries only the keyword, and "alt" told to a screen reader is not a sentence.
 */
const FRAME_PHRASES: Record<string, { open: string; section: string; close: string }> = {
  loop: { open: 'Loop', section: 'Loop', close: 'End of loop' },
  alt: { open: 'Alternative', section: 'Otherwise', close: 'End of alternative' },
  opt: { open: 'Optional', section: 'Optional', close: 'End of optional' },
  par: { open: 'In parallel', section: 'And in parallel', close: 'End of parallel' },
  critical: { open: 'Critical', section: 'Option', close: 'End of critical' },
  break: { open: 'Break', section: 'Break', close: 'End of break' },
};

const FAMILY_NAMES: Record<string, string> = {
  flowchart: 'Flowchart',
  sequence: 'Sequence diagram',
  state: 'State diagram',
  pie: 'Pie chart',
};

/** Detail lines before the tail becomes a count. Roughly one screen of a browse-mode list. */
const MAX_DETAILS = 40;

/** Names printed in full inside a summary clause before the rest become a count. */
const MAX_NAMED = 3;

function count(n: number, singular: string): string {
  return `${n} ${n === 1 ? singular : `${singular}s`}`;
}

function capped(lines: readonly string[], noun: string): string[] {
  if (lines.length <= MAX_DETAILS) {
    return [...lines];
  }

  return [
    ...lines.slice(0, MAX_DETAILS),
    `…and ${count(lines.length - MAX_DETAILS, `more ${noun}`)}.`,
  ];
}

function named(names: readonly string[], limit: number = MAX_NAMED): string {
  if (names.length <= limit) {
    return names.join(', ');
  }

  return `${names.slice(0, limit).join(', ')} and ${count(names.length - limit, 'other')}`;
}

function number(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 1000) / 10}%`;
}

function heading(scene: Scene): string {
  const family = FAMILY_NAMES[scene.family] ?? 'Diagram';

  return scene.title ? `${family} "${scene.title}"` : family;
}

function nameOf(node: SceneNode | undefined, id: string): string {
  if (!node) {
    return id;
  }

  const text = node.label.lines.join(' ').trim();

  return text || node.name || SHAPE_NAMES[node.shape] || node.id;
}

/** Nested groups are groups too — the count is of what is drawn, not of the top level. */
function countClusters(clusters: readonly SceneCluster[]): number {
  return clusters.reduce((total, cluster) => total + 1 + countClusters(cluster.children), 0);
}

function verbOf(edge: SceneEdge): string {
  if (edge.arrow !== 'none' && edge.startArrow !== 'none') {
    return 'is connected both ways with';
  }

  return edge.arrow === 'none' ? 'is connected to' : 'leads to';
}

/**
 * What the truncated tail was carrying, as one sentence: how many disconnected pieces there are,
 * where the flow enters and leaves, and the node the most edges pass through. Computed only when
 * lines were actually dropped — on a small diagram the list itself says all of this.
 */
function structureOf(scene: GraphScene, name: (id: string) => string): string {
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;

    while (parent.get(root) !== undefined && parent.get(root) !== root) {
      root = parent.get(root) as string;
    }

    return root;
  };

  for (const node of scene.nodes) {
    parent.set(node.id, node.id);
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
  }

  for (const edge of scene.edges) {
    outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    parent.set(find(edge.source), find(edge.target));
  }

  const parts = new Set(scene.nodes.map((node) => find(node.id)));
  const starts: string[] = [];
  const ends: string[] = [];
  let busiest: { id: string; degree: number } | null = null;

  for (const node of scene.nodes) {
    const into = inDegree.get(node.id) ?? 0;
    const out = outDegree.get(node.id) ?? 0;

    if (into === 0 && out > 0) {
      starts.push(name(node.id));
    }

    if (out === 0 && into > 0) {
      ends.push(name(node.id));
    }

    if (!busiest || into + out > busiest.degree) {
      busiest = { id: node.id, degree: into + out };
    }
  }

  const clauses: string[] = [];

  if (parts.size > 1) {
    clauses.push(count(parts.size, 'separate part'));
  }

  if (starts.length > 0) {
    clauses.push(`starts at ${named(starts)}`);
  }

  if (ends.length > 0) {
    clauses.push(`ends at ${named(ends)}`);
  }

  if (busiest && busiest.degree > 2) {
    clauses.push(`busiest is ${name(busiest.id)} with ${count(busiest.degree, 'connection')}`);
  }

  return clauses.length > 0 ? ` Structure: ${clauses.join('; ')}.` : '';
}

function describeGraph(scene: GraphScene): SceneDescription {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const connected = new Set<string>();
  const edgeLines: string[] = [];
  const details: string[] = [];

  for (const edge of scene.edges) {
    const sourceNode = byId.get(edge.source);
    const targetNode = byId.get(edge.target);
    const source = nameOf(sourceNode, edge.source);
    const target = nameOf(targetNode, edge.target);
    const label = edge.label?.box.lines.join(' ').trim();
    const suffix = label ? `, labelled ${label}` : '';

    // Both endpoints count as connected either way, so a note is never listed as a lone node.
    connected.add(edge.source);
    connected.add(edge.target);

    /*
     * A state note is a flagged node on a headless dotted edge, so without this it is announced as
     * a relationship — "Draft is connected to the author can still edit." It is the same construct
     * `describeSequence` already has a line for, and it reads the same way here.
     */
    if (sourceNode?.shape === 'state-note' || targetNode?.shape === 'state-note') {
      const fromNote = sourceNode?.shape === 'state-note';

      edgeLines.push(`Note on ${fromNote ? target : source}: ${fromNote ? source : target}.`);
      continue;
    }

    edgeLines.push(
      edge.source === edge.target
        ? `${source} leads back to itself${suffix}.`
        : `${source} ${verbOf(edge)} ${target}${suffix}.`,
    );
  }

  details.push(...capped(edgeLines, 'connection'));

  const alone = scene.nodes.filter((node) => !connected.has(node.id));

  if (alone.length > 0 && scene.edges.length > 0) {
    details.push(
      `Not connected: ${named(
        alone.map((node) => nameOf(node, node.id)),
        MAX_DETAILS,
      )}.`,
    );
  } else if (scene.edges.length === 0) {
    details.push(
      ...capped(
        scene.nodes.map((node) => `${nameOf(node, node.id)}.`),
        'node',
      ),
    );
  }

  const parts = [count(scene.nodes.length, 'node'), count(scene.edges.length, 'connection')];
  const groups = countClusters(scene.clusters);

  if (groups > 0) {
    parts.push(count(groups, 'group'));
  }

  const truncated =
    edgeLines.length > MAX_DETAILS ||
    (scene.edges.length === 0 && scene.nodes.length > MAX_DETAILS);
  const structure = truncated ? structureOf(scene, (id) => nameOf(byId.get(id), id)) : '';

  return {
    summary:
      scene.nodes.length === 0
        ? `${heading(scene)}: empty.`
        : `${heading(scene)}: ${parts.join(', ')}.${structure}`,
    details,
  };
}

function describePie(scene: PieScene): SceneDescription {
  const total = scene.legend.reduce((sum, item) => sum + item.value, 0);

  return {
    summary:
      scene.legend.length === 0
        ? `${heading(scene)}: empty.`
        : `${heading(scene)}: ${count(scene.legend.length, 'slice')}, totalling ${number(total)}.`,
    details: capped(
      scene.legend.map(
        (item) => `${item.label}: ${number(item.value)} (${percent(item.fraction)}).`,
      ),
      'slice',
    ),
  };
}

/**
 * Participants first, then everything that happens, in the order it happens. Messages, notes and
 * frame boundaries are merged on their y rather than concatenated: the reading order of a sequence
 * diagram is the whole content, and two separate lists would lose it.
 *
 * The frames matter more than they look. Without them the two branches of an `alt` are announced as
 * consecutive events, so the listener is told the call both succeeded and failed. A close is ranked
 * before an open at the same y, because a frame that ends exactly where its sibling begins reads
 * backwards otherwise.
 */
function describeSequence(scene: SequenceScene): SceneDescription {
  const names = new Map(
    scene.participants.map((participant) => [
      participant.id,
      participant.label.lines.join(' ').trim() || participant.id,
    ]),
  );
  const nameOfId = (id: string): string => names.get(id) ?? id;
  const entries: { y: number; rank: number; line: string }[] = [];

  for (const message of scene.messages) {
    const label = message.label?.box.lines.join(' ').trim();
    const said = label ? `: ${label}` : '';
    const who = message.self ? 'itself' : nameOfId(message.target);

    entries.push({
      y: message.points[0]?.y ?? 0,
      rank: 2,
      line: `${nameOfId(message.source)} tells ${who}${said}.`,
    });
  }

  for (const note of scene.notes) {
    const targets = note.targets.map(nameOfId).join(' and ');

    entries.push({
      y: note.box.y,
      rank: 2,
      line: `Note on ${targets}: ${note.label.box.lines.join(' ').trim()}.`,
    });
  }

  for (const frame of scene.frames) {
    const phrases = FRAME_PHRASES[frame.kind];

    if (!phrases) {
      continue;
    }

    const said = (phrase: string, label: string | undefined): string =>
      label ? `${phrase}: ${label}.` : `${phrase}.`;

    entries.push({
      y: frame.box.y,
      rank: 1,
      line: said(phrases.open, frame.label?.box.lines.join(' ').trim()),
    });

    for (const section of frame.sections) {
      entries.push({
        y: section.y,
        rank: 1,
        line: said(phrases.section, section.label?.box.lines.join(' ').trim()),
      });
    }

    entries.push({ y: frame.box.y + frame.box.height, rank: 0, line: `${phrases.close}.` });
  }

  entries.sort((a, b) => a.y - b.y || a.rank - b.rank);

  return {
    summary:
      scene.participants.length === 0
        ? `${heading(scene)}: empty.`
        : `${heading(scene)}: ${count(scene.participants.length, 'participant')}, ${count(scene.messages.length, 'message')}.`,
    details:
      scene.participants.length === 0
        ? []
        : [
            `Participants: ${named([...names.values()], MAX_DETAILS)}.`,
            ...capped(
              entries.map((entry) => entry.line),
              'step',
            ),
          ],
  };
}

export function describeScene(scene: Scene): SceneDescription {
  if (scene.kind === 'pie') {
    return describePie(scene);
  }

  return scene.kind === 'sequence' ? describeSequence(scene) : describeGraph(scene);
}
