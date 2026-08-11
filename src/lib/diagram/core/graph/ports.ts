/*
 * Port assignment: where each edge actually meets its endpoint's outline.
 *
 * A ray anchor answers "where does the outline face this neighbour", which is the wrong question
 * four times over. On a bar it is wrong for the shape: every ray from an 80x8 box leaves within a
 * few pixels of its centre, so a fork's exits pinch together instead of spreading along it. On a
 * pointy shape it is wrong for the outline: the ray lands somewhere arbitrary on a slope, and no two
 * edges on the same side agree on where that is. It is wrong for the route: a chord that leaves
 * diagonally is drawn as rank-axis legs, so a ray that lands on a left or right side is left along
 * the outline rather than away from it. And on any shape it is wrong for the neighbours: two edges
 * heading the same way land on top of each other, arrowhead over arrowhead.
 *
 * So a port is chosen the way it is drawn: pick the side the route leaves through, slide along that
 * side to face the neighbour, and take the point where the outline actually is there.
 *
 * `portPoint` answers all but the last, per shape and per edge. `assignPorts` answers the last,
 * which needs the whole set of incident edges and so has to run before routing.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { Point, Rect, ShapeDef, Size } from '../../types.ts';
import { rayRect } from '../geometry/intersect.ts';
import type { Axis } from './route.ts';
import { separate, strokeGap } from './spacing.ts';

export interface PortEdge {
  id: string;
  source: string;
  target: string;
  /** Point the route heads for after leaving the source. */
  nearSource: Point;
  /** Point the route arrives from before reaching the target. */
  nearTarget: Point;
  /**
   * Where along its side an end has to sit, as an offset from the middle of that side, when the
   * router has already decided: the lane it gives the port is one the chord to the neighbour does not
   * ask for, and asking through the aim point cannot say it — the chord crossing is damped by how far
   * away the neighbour is, so a far one moves the port by a fraction of what was wanted. Spacing
   * against the other ports on the side still applies.
   */
  alongSource?: number;
  alongTarget?: number;
}

export interface PortNode {
  box: Rect;
  shape: ShapeDef;
}

export interface EdgePorts {
  source?: Point;
  target?: Point;
}

type Role = 'source' | 'target';

const NEAR = 1e-6;

const cross = (axis: Axis): Axis => (axis === 'y' ? 'x' : 'y');

function low(rect: Rect, axis: Axis): number {
  return axis === 'x' ? rect.x : rect.y;
}

function high(rect: Rect, axis: Axis): number {
  return axis === 'x' ? rect.x + rect.width : rect.y + rect.height;
}

function pointAt(axis: Axis, rank: number, at: number): Point {
  return axis === 'y' ? { x: at, y: rank } : { x: rank, y: at };
}

function extentOf(box: Size, axis: Axis): number {
  return axis === 'x' ? box.width : box.height;
}

function centreOf(box: Rect): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function sizeOf(box: Rect): Size {
  return { width: box.width, height: box.height };
}

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

/**
 * Which side an edge crosses: the one facing along the rank axis, unless the neighbour is beside
 * the node rather than past it. Routing turns every diagonal hop into rank-axis legs, so this is
 * the side the drawn stroke leaves through — picking any other one puts the first leg along the
 * outline instead of away from it.
 */
export function exitAxis(box: Size, toward: Point, axis: Axis): Axis {
  return Math.abs(toward[axis]) > extentOf(box, axis) / 2 ? axis : cross(axis);
}

/** Which end of the exit axis the port sits on. */
export function sideSign(toward: Point, exit: Axis): number {
  return toward[exit] < 0 ? -1 : 1;
}

/**
 * How much of a side a port may take: the straight part of it, the whole run including the corners
 * it may ride, and the most the shape has either way.
 *
 * One edge asks for the straight, and asks for it a full arrow half-width short of where the side
 * stops being straight: an arrowhead there is square on to the outline and sits entirely on it, and
 * the stroke leaves it square too. Crowding is what earns the rest — a port pushed off the straight
 * rides a corner arc, far enough to keep several of them apart on a side barely longer than its own
 * corners, and no further than the point where the outline has turned 30 degrees away.
 *
 * A side with neither a run nor an arc is a point (a diamond's vertex, a cylinder's lid) and lends
 * nothing at all, so it is called out: the crowd on one has to take the faces beside it instead.
 */
function runOf(
  shape: ShapeDef,
  box: Size,
  along: Axis,
  m: DiagramMetrics,
): { reach: number; straight: number; limit: number; point: boolean } {
  const limit = Math.max(0, extentOf(box, along) / 2 - m.arrowWidth / 2);
  const sides = shape.sides?.(box, m);

  if (!sides) {
    return { reach: limit, straight: limit, limit, point: shape.ports === 'vertex' };
  }

  const flat = extentOf(sides.flat, along);
  const straight = Math.max(0, Math.min(flat / 2 - m.arrowWidth / 2, limit));

  return {
    reach: Math.max(0, Math.min(straight + sides.corner / 2, limit)),
    straight,
    limit,
    point: flat < NEAR && sides.corner < NEAR,
  };
}

/**
 * How far either way along the side facing `exit` a port may be asked for. A pointy outline has one
 * port per side and a bar spreads its own, so neither lends anything to a caller with a lane in mind.
 */
export function sideRun(shape: ShapeDef, box: Size, exit: Axis, m: DiagramMetrics): number {
  return shape.ports === 'vertex' || shape.ports === 'spread'
    ? 0
    : runOf(shape, box, cross(exit), m).straight;
}

/** Axis point of the side `toward` faces — the only place a pointy outline can be met square on. */
function vertexToward(box: Size, toward: Point, exit: Axis): Point {
  return pointAt(exit, (sideSign(toward, exit) * extentOf(box, exit)) / 2, 0);
}

/** Where the chord to the neighbour crosses the exit side, kept inside the run it may use. */
function alongToward(box: Size, toward: Point, exit: Axis, reach: number): number {
  const lateral = toward[cross(exit)];
  const depth = Math.abs(toward[exit]);

  return depth < NEAR
    ? Math.sign(lateral) * reach
    : clamp((lateral * extentOf(box, exit)) / 2 / depth, reach);
}

/**
 * The outline, exactly `along` from the middle of the side facing `sign` on `exit`.
 *
 * A shape answers where its boundary is along a ray, which is a different question: aim a ray at
 * the point `along` the side and a curved outline is met before it, a little short of where the
 * spacing pass put it. So the ray is solved for instead. The lateral coordinate of the hit rises
 * with the ray's own, once, on a convex outline, which is all a bisection needs.
 */
function sidePoint(
  shape: ShapeDef,
  box: Size,
  exit: Axis,
  sign: number,
  along: number,
  m: DiagramMetrics,
): Point {
  const lateral = cross(exit);
  const depth = (sign * extentOf(box, exit)) / 2;
  const at = (aim: number): Point => {
    const toward = pointAt(exit, depth, Math.sign(along) * aim);

    return shape.anchor ? shape.anchor(box, toward, m) : rayRect(box, toward);
  };
  const want = Math.abs(along);

  if (want < NEAR) {
    return at(0);
  }

  let upper = want;

  for (let i = 0; i < 20 && Math.abs(at(upper)[lateral]) < want; i += 1) {
    upper *= 2;
  }

  let lower = 0;

  for (let i = 0; i < 24; i += 1) {
    const middle = (lower + upper) / 2;

    if (Math.abs(at(middle)[lateral]) < want) {
      lower = middle;
    } else {
      upper = middle;
    }
  }

  return at(upper);
}

/**
 * Where one edge meets one outline, in the node's local space, before its neighbours on the same
 * side are taken into account.
 */
export function portPoint(
  shape: ShapeDef,
  box: Size,
  toward: Point,
  m: DiagramMetrics,
  axis: Axis,
): Point {
  const exit = exitAxis(box, toward, axis);

  if (shape.ports === 'vertex') {
    return vertexToward(box, toward, exit);
  }

  const { straight } = runOf(shape, box, cross(exit), m);

  return sidePoint(
    shape,
    box,
    exit,
    sideSign(toward, exit),
    alongToward(box, toward, exit, straight),
    m,
  );
}

interface Incident {
  edge: PortEdge;
  role: Role;
  index: number;
  toward: Point;
  /** `alongSource` / `alongTarget` for this end, when the router asked for one. */
  along?: number;
}

function incidentsOf(id: string, edges: readonly PortEdge[]): Incident[] {
  const out: Incident[] = [];

  for (const [index, edge] of edges.entries()) {
    if (edge.source === edge.target) {
      continue;
    }

    if (edge.source === id) {
      const entry: Incident = { edge, role: 'source', index, toward: edge.nearSource };

      if (edge.alongSource !== undefined) {
        entry.along = edge.alongSource;
      }

      out.push(entry);
    }

    if (edge.target === id) {
      const entry: Incident = { edge, role: 'target', index, toward: edge.nearTarget };

      if (edge.alongTarget !== undefined) {
        entry.along = edge.alongTarget;
      }

      out.push(entry);
    }
  }

  return out;
}

/**
 * Bar ports: one even spread per face, ordered by where the neighbours actually sit. A fork's job is
 * to look like a fork, so the spread is the point rather than a fallback for a collision.
 */
function spreadAlong(
  box: Rect,
  group: readonly Incident[],
  axis: Axis,
  assign: (id: string, role: Role, port: Point) => void,
): void {
  const lateral = cross(axis);
  const order = [...group].sort(
    (a, b) => a.toward[lateral] - b.toward[lateral] || a.index - b.index,
  );
  const middle = (low(box, axis) + high(box, axis)) / 2;

  for (const [slot, entry] of order.entries()) {
    const at =
      low(box, lateral) +
      ((high(box, lateral) - low(box, lateral)) * (slot + 1)) / (order.length + 1);
    const rank = entry.toward[axis] >= middle ? high(box, axis) : low(box, axis);

    assign(entry.edge.id, entry.role, pointAt(axis, rank, at));
  }
}

interface Placed {
  entry: Incident;
  exit: Axis;
  sign: number;
  along: number;
  lateral: number;
  /** Is the lane this end joins the one its own ideal sits on — is the edge already straight here? */
  straight: boolean;
}

/**
 * Ports that chose the same side, slid apart until an arrowhead fits between each pair and the one
 * before it. Every edge counts, arriving or leaving: an exit that starts where an arrowhead lands
 * draws as one stroke with a branch, not as two edges. Order along the side is kept, so an edge
 * never crosses a neighbour to make room.
 *
 * Who gives way is not shared out evenly. An end already sitting on the lane its route arrives on
 * draws as one straight run, and the spacing pass is the only thing that can take that away: the
 * side has room for both ports, so an even split moves a straight edge a few pixels off its own axis
 * and buys the neighbour — which is bent either way — nothing at all. Those ends are handed to
 * `separate` as held, so the crowd opens around them.
 *
 * A side that is a single point is the exception, both ways round. It has no run to spend, so the
 * crowd on it borrows exactly as much of the faces beside it as the spacing needs and no more —
 * without that, `N` edges meet a diamond's vertex or a cylinder's lid at one point and `N`
 * arrowheads are drawn as one. And two edges *leaving* a point need nothing between them: they
 * share the vertex and diverge from it, which is what makes a fork read as a fork.
 */
function spaceSide(
  centre: Point,
  shape: ShapeDef,
  box: Size,
  group: readonly Incident[],
  axis: Axis,
  m: DiagramMetrics,
  assign: (id: string, role: Role, port: Point) => void,
): void {
  const sides = new Map<string, Placed[]>();

  for (const entry of group) {
    const toward = { x: entry.toward.x - centre.x, y: entry.toward.y - centre.y };
    const exit = exitAxis(box, toward, axis);
    const run = runOf(shape, box, cross(exit), m);
    const asked = entry.along === undefined ? undefined : clamp(entry.along, run.straight);
    const along = run.point ? 0 : (asked ?? alongToward(box, toward, exit, run.straight));
    const lateral = toward[cross(exit)];
    const placed: Placed = {
      entry,
      exit,
      sign: sideSign(toward, exit),
      along,
      lateral,
      straight: Math.abs(along - lateral) < NEAR,
    };
    const key = `${exit}${placed.sign}`;
    const bucket = sides.get(key);

    if (bucket) {
      bucket.push(placed);
    } else {
      sides.set(key, [placed]);
    }
  }

  const need = strokeGap(m);

  for (const bucket of sides.values()) {
    const exit = (bucket[0] as Placed).exit;
    const sign = (bucket[0] as Placed).sign;
    const run = runOf(shape, box, cross(exit), m);
    const order = [...bucket].sort(
      (a, b) => a.along - b.along || a.lateral - b.lateral || a.entry.index - b.entry.index,
    );
    const gaps = order
      .slice(1)
      .map((placed, index) =>
        run.point &&
        placed.entry.role === 'source' &&
        (order[index] as Placed).entry.role === 'source'
          ? 0
          : need,
      );
    const reach = run.point
      ? Math.min(run.limit, gaps.reduce((total, gap) => total + gap, 0) / 2)
      : run.reach;
    const spaced = separate(
      order.map(({ along }) => along),
      gaps,
      -reach,
      reach,
      order.map(({ straight }) => straight),
    );

    for (const [slot, { entry }] of order.entries()) {
      const hit = sidePoint(shape, box, exit, sign, spaced[slot] as number, m);

      assign(entry.edge.id, entry.role, { x: centre.x + hit.x, y: centre.y + hit.y });
    }
  }
}

/**
 * @param nodes every node an edge can end on, keyed by id.
 * @param edges every edge, in declaration order — the deterministic tie-break.
 */
export function assignPorts(
  nodes: ReadonlyMap<string, PortNode>,
  edges: readonly PortEdge[],
  axis: Axis,
  m: DiagramMetrics,
): Map<string, EdgePorts> {
  const ports = new Map<string, EdgePorts>();
  const assign = (id: string, role: Role, port: Point): void => {
    ports.set(id, { ...ports.get(id), [role]: port });
  };

  for (const [id, node] of nodes) {
    const incident = incidentsOf(id, edges);

    if (incident.length === 0) {
      continue;
    }

    if (node.shape.ports === 'spread') {
      for (const role of ['source', 'target'] as const) {
        const group = incident.filter((entry) => entry.role === role);

        if (group.length > 0) {
          spreadAlong(node.box, group, axis, assign);
        }
      }

      continue;
    }

    spaceSide(centreOf(node.box), node.shape, sizeOf(node.box), incident, axis, m, assign);
  }

  return ports;
}
