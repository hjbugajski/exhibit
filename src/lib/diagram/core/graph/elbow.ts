/*
 * L-routes: leave the source along the rank axis, run straight to the target's row, turn once, and
 * arrive across the target's side.
 *
 * The elbow pass turns every diagonal hop into a pair of rank-axis legs bridged in the middle of the
 * gap, which is right when an edge has to change lanes between two ranks and wrong when it simply
 * has to reach something off to one side: the stroke drops, swerves, drops again and meets the far
 * shape on the face it was already pointing at. One corner says the same thing with less line, and
 * it lands on the side that actually faces where the edge came from.
 *
 * So the shape is chosen here, before ports are assigned — the entry side is a port decision, and an
 * end left out of that pass is an end nothing else on its side knows to make room for. `planElbow`
 * answers with the point the target port should face, which is all the port pass needs to spread an
 * L-route in with its neighbours; `routeEdge` draws the two legs once the ports come back.
 *
 * Everything else keeps the elbow route. The qualifying set is deliberately narrow, because an L is
 * a claim about empty space: it abandons the lane the layout chose and drops down the source's own,
 * so it is only offered when both legs are provably clear and the turn is far enough from either end
 * to read as a corner rather than a hook.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { Point, Rect } from '../../types.ts';
import { rectsOverlap } from '../geometry/intersect.ts';
import { exitAxis, portPoint, sideSign } from './ports.ts';
import type { Axis, RouteEndpoint, RouteObstacle } from './route.ts';
import { anchorOn } from './route.ts';
import { strokeGap } from './spacing.ts';

/**
 * Shortest lateral leg that reads as a deliberate elbow. Below it the turn is a hook off the
 * target's corner, and the two rounded corners of a jog say the same thing more legibly.
 */
export const ELBOW_MIN_RUN = 48;

export interface ElbowEdge {
  source: RouteEndpoint;
  target: RouteEndpoint;
  sourceId: string;
  targetId: string;
  /** Where the source port faces — the same point the port pass is given. */
  aim: Point;
  /** Virtual-chain points in author order, final space. */
  interior: readonly Point[];
}

function cross(axis: Axis): Axis {
  return axis === 'y' ? 'x' : 'y';
}

function pointAt(axis: Axis, rank: number, at: number): Point {
  return axis === 'y' ? { x: at, y: rank } : { x: rank, y: at };
}

/** The band one leg sweeps: `half` either side of `at`, from `from` to `to` along `along`. */
function corridorOf(along: Axis, from: number, to: number, at: number, half: number): Rect {
  const low = Math.min(from, to);
  const length = Math.abs(to - from);

  return along === 'x'
    ? { x: low, y: at - half, width: length, height: half * 2 }
    : { x: at - half, y: low, width: half * 2, height: length };
}

/**
 * Does the virtual chain describe the same L? It may stay in the source's lane the whole way down,
 * and it may step across to the target's once — that is the single lateral jog an L is. A chain
 * that picked a lane of its own is a route the ordering pass shaped on purpose, and keeps it.
 */
function chainFollows(
  interior: readonly Point[],
  lateral: Axis,
  lane: number,
  toward: number,
  band: number,
): boolean {
  let moved = false;

  for (const point of interior) {
    const at = point[lateral];

    if (!moved && Math.abs(at - lane) <= band) {
      continue;
    }

    if (Math.abs(at - toward) > band) {
      return false;
    }

    moved = true;
  }

  return true;
}

/**
 * The point the target port should face for an L-route, or null when this edge keeps the elbow
 * route. Everything the shape needs is settled here: the source leaves across its rank-axis face,
 * the drop reaches the target's row with room for the corner, the lateral leg is long enough to read
 * as one, the chain agrees, and both legs clear every box that is not one of the two endpoints.
 *
 * A connector bar is never an end of one. Its ports are spread along its length on purpose — a fork
 * that elbowed would stop reading as a fork — and the spread is also the one port policy this cannot
 * predict, since it depends on how many edges the bar ends up carrying.
 *
 * The lane is the source port this edge would get on its own; the spacing pass may still slide it
 * along its side to clear a neighbour, which is why the corridor is a band a stroke wide either side
 * rather than a line. `assertElbowRoutes` re-checks the clearance against the ports that came out.
 */
export function planElbow(
  edge: ElbowEdge,
  obstacles: readonly RouteObstacle[],
  axis: Axis,
  m: DiagramMetrics,
): Point | null {
  const { source, target } = edge;

  if (source.shape.ports === 'spread' || target.shape.ports === 'spread') {
    return null;
  }

  const lateral = cross(axis);
  const toward = { x: edge.aim.x - source.centre.x, y: edge.aim.y - source.centre.y };
  const forward = Math.sign(target.centre[axis] - source.centre[axis]);

  if (
    forward === 0 ||
    exitAxis(source.size, toward, axis) !== axis ||
    sideSign(toward, axis) !== forward
  ) {
    return null;
  }

  const port = portPoint(source.shape, source.size, toward, m, axis);
  const lane = source.centre[lateral] + port[lateral];
  const exitAt = source.centre[axis] + port[axis];
  const row = target.centre[axis];

  // Room to turn out of the source, and to trim a start cap onto the leg before the corner.
  if ((row - exitAt) * forward < m.cornerRadius + m.arrowLength) {
    return null;
  }

  const clearance = strokeGap(m);
  const least = Math.max(ELBOW_MIN_RUN, m.cornerRadius + m.arrowLength + clearance);
  const across = target.centre[lateral] - lane;

  // The centre is further out than the side the edge lands on, so this is the weaker half of the
  // leg-length test below. It is asked first because it is also what makes the sign of the approach
  // unambiguous: a target sitting on the lane to within float noise has no side facing the source,
  // and the outline and the port pass need not round that noise the same way.
  if (Math.abs(across) <= least) {
    return null;
  }

  const side = Math.sign(across);
  const aim = pointAt(axis, row, lane);
  const entry = anchorOn(target, aim, m);

  if ((entry[lateral] - lane) * side < least) {
    return null;
  }

  if (!chainFollows(edge.interior, lateral, lane, target.centre[lateral], m.edgeSep)) {
    return null;
  }

  const legs = [
    corridorOf(axis, exitAt, row, lane, clearance),
    corridorOf(lateral, lane, entry[lateral], row, clearance),
  ];

  for (const obstacle of obstacles) {
    if (obstacle.node === edge.sourceId || obstacle.node === edge.targetId) {
      continue;
    }

    if (legs.some((leg) => rectsOverlap(leg, obstacle.rect))) {
      return null;
    }
  }

  return aim;
}
