/*
 * The twelve flowchart shapes. Each owns its padding (`size`) and its outline `d`, emitted centred
 * on the origin so a node draws with a translate. Shapes whose outline is not a rectangle also
 * supply `anchor`, so edges land on the real boundary.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { Point, ShapeDef, Size } from '../../types.ts';
import { rayCylinder, rayEllipse, rayPolygon, rayRoundedRect } from '../geometry/intersect.ts';
import { ellipseD, polygonD, rectD, round2 } from '../geometry/path.ts';
import { ellipseSides, roundedSides } from './sides.ts';

type Corners = (box: Size) => Point[];

function padded(label: Size, m: DiagramMetrics, extraWidth = 0, extraHeight = 0): Size {
  return {
    width: Math.max(m.minNodeWidth, label.width + m.nodePaddingX * 2 + extraWidth),
    height: Math.max(m.minNodeHeight, label.height + m.nodePaddingY * 2 + extraHeight),
  };
}

/**
 * @param sides how much of each side is straight. A slanted side counts as straight — its normal is
 * tilted, not curved, so a port anywhere along it still meets the outline square enough to leave
 * across it. A side that is a single point takes 0 and every edge on it meets at the point.
 */
function polygonShape(
  size: ShapeDef['size'],
  corners: Corners,
  flat?: (box: Size) => Size,
): ShapeDef {
  const shape: ShapeDef = {
    size,
    outline: (box) => polygonD(corners(box)),
    anchor: (box, toward) => rayPolygon(corners(box), toward),
  };

  return flat ? { ...shape, sides: (box) => ({ flat: flat(box), corner: 0 }) } : shape;
}

/** Diagonal cut of the slanted shapes, tied to height so the slant reads the same at any size. */
function slant(box: Size): number {
  return Math.min(box.height * 0.4, box.width / 3);
}

function circleRadius(label: Size, m: DiagramMetrics): number {
  return Math.max(
    Math.max(m.minNodeWidth, m.minNodeHeight) / 2,
    Math.hypot(label.width, label.height) / 2 + m.nodePaddingY,
  );
}

const roundRadius = (box: Size, m: DiagramMetrics): number =>
  Math.min(box.height / 2, m.cornerRadius * 3);

const rect: ShapeDef = {
  size: (label, m) => padded(label, m),
  outline: (box, m) => rectD(box, m.cornerRadius),
  anchor: (box, toward, m) => rayRoundedRect(box, m.cornerRadius, toward),
  sides: roundedSides((_, m) => m.cornerRadius),
};

const round: ShapeDef = {
  size: (label, m) => padded(label, m),
  outline: (box, m) => rectD(box, roundRadius(box, m)),
  anchor: (box, toward, m) => rayRoundedRect(box, roundRadius(box, m), toward),
  sides: roundedSides(roundRadius),
};

const stadium: ShapeDef = {
  size: (label, m) => padded(label, m, m.nodePaddingX),
  outline: (box) => rectD(box, box.height / 2),
  anchor: (box, toward) => rayRoundedRect(box, box.height / 2, toward),
  sides: roundedSides((box) => box.height / 2),
};

const SUBROUTINE_INSET = 8;

const subroutine: ShapeDef = {
  size: (label, m) => padded(label, m, SUBROUTINE_INSET * 2),
  outline: (box, m) => {
    const x = round2(box.width / 2 - SUBROUTINE_INSET);
    const top = round2(-box.height / 2);
    const bottom = round2(box.height / 2);

    return `${rectD(box, m.cornerRadius)}M${-x},${top}L${-x},${bottom}M${x},${top}L${x},${bottom}`;
  },
  anchor: (box, toward, m) => rayRoundedRect(box, m.cornerRadius, toward),
  sides: roundedSides((_, m) => m.cornerRadius),
};

const CYLINDER_LIP = 8;

const cylinder: ShapeDef = {
  size: (label, m) => padded(label, m, 0, CYLINDER_LIP * 2),
  outline: (box) => {
    const w = round2(box.width / 2);
    const h = box.height / 2;
    const top = round2(-h + CYLINDER_LIP);
    const bottom = round2(h - CYLINDER_LIP);
    const arc = `A${w},${CYLINDER_LIP} 0 0 `;

    return (
      `M${-w},${top}${arc}1 ${w},${top}L${w},${bottom}${arc}1 ${-w},${bottom}Z` +
      `M${-w},${top}${arc}0 ${w},${top}`
    );
  },
  anchor: (box, toward) => rayCylinder(box, CYLINDER_LIP, toward),
  // The lid and the base are elliptical the whole way across, so a lone port on one takes the apex
  // and a crowd spreads along the curve; the sides are straight between the two lips and have no
  // arc to ride.
  sides: (box) => ({
    flat: { width: 0, height: Math.max(0, box.height - CYLINDER_LIP * 2) },
    corner: 0,
  }),
};

const circle: ShapeDef = {
  size: (label, m) => {
    const radius = circleRadius(label, m);

    return { width: radius * 2, height: radius * 2 };
  },
  outline: (box) => ellipseD(box.width / 2, box.height / 2),
  anchor: (box, toward) => rayEllipse(box.width / 2, box.height / 2, toward),
  sides: ellipseSides,
};

const DOUBLE_CIRCLE_GAP = 4;

const doubleCircle: ShapeDef = {
  size: (label, m) => {
    const radius = circleRadius(label, m) + DOUBLE_CIRCLE_GAP;

    return { width: radius * 2, height: radius * 2 };
  },
  outline: (box) => {
    const outer = box.width / 2;

    return `${ellipseD(outer, box.height / 2)}${ellipseD(
      outer - DOUBLE_CIRCLE_GAP,
      box.height / 2 - DOUBLE_CIRCLE_GAP,
    )}`;
  },
  anchor: (box, toward) => rayEllipse(box.width / 2, box.height / 2, toward),
  sides: ellipseSides,
};

/**
 * A label of w x h fits a rhombus with half-diagonals A, B when w/2A + h/2B <= 1. Widening by 1.8
 * and heightening by 2.5 satisfies it with a little slack while staying much less square than the
 * naive 2x/2x solution.
 */
const diamond: ShapeDef = {
  ...polygonShape(
    (label, m) => ({
      width: Math.max(m.minNodeWidth, (label.width + m.nodePaddingX) * 1.8),
      height: Math.max(m.minNodeHeight, (label.height + m.nodePaddingY) * 2.5),
    }),
    (box) => [
      { x: 0, y: -box.height / 2 },
      { x: box.width / 2, y: 0 },
      { x: 0, y: box.height / 2 },
      { x: -box.width / 2, y: 0 },
    ],
  ),
  ports: 'vertex',
};

const hexagonCut = (box: Size): number => Math.min(box.height / 2, box.width / 3);

const hexagon = polygonShape(
  (label, m) => {
    const box = padded(label, m);

    return { width: box.width + box.height * 0.5, height: box.height };
  },
  (box) => {
    const w = box.width / 2;
    const h = box.height / 2;
    const cut = hexagonCut(box);

    return [
      { x: -w + cut, y: -h },
      { x: w - cut, y: -h },
      { x: w, y: 0 },
      { x: w - cut, y: h },
      { x: -w + cut, y: h },
      { x: -w, y: 0 },
    ];
  },
  // Left and right are single points, like a diamond's: every edge on one meets it there.
  (box) => ({ width: Math.max(0, box.width - hexagonCut(box) * 2), height: 0 }),
);

function slantedSize(label: Size, m: DiagramMetrics): Size {
  const box = padded(label, m);

  return { width: box.width + box.height * 0.4, height: box.height };
}

/**
 * What a slanted shape has to attach to. Its two horizontal sides are the same run shifted opposite
 * ways by the cut, so the part both of them cover is the box less both cuts; the sloped sides run
 * the full height and a port anywhere on one still faces out.
 */
function slantedFlat(box: Size): Size {
  return { width: Math.max(0, box.width - slant(box) * 2), height: box.height };
}

const parallelogram = polygonShape(
  slantedSize,
  (box) => {
    const w = box.width / 2;
    const h = box.height / 2;
    const cut = slant(box);

    return [
      { x: -w + cut, y: -h },
      { x: w, y: -h },
      { x: w - cut, y: h },
      { x: -w, y: h },
    ];
  },
  slantedFlat,
);

const parallelogramAlt = polygonShape(
  slantedSize,
  (box) => {
    const w = box.width / 2;
    const h = box.height / 2;
    const cut = slant(box);

    return [
      { x: -w, y: -h },
      { x: w - cut, y: -h },
      { x: w, y: h },
      { x: -w + cut, y: h },
    ];
  },
  slantedFlat,
);

const trapezoid = polygonShape(
  slantedSize,
  (box) => {
    const w = box.width / 2;
    const h = box.height / 2;
    const cut = slant(box);

    return [
      { x: -w + cut, y: -h },
      { x: w - cut, y: -h },
      { x: w, y: h },
      { x: -w, y: h },
    ];
  },
  slantedFlat,
);

const trapezoidAlt = polygonShape(
  slantedSize,
  (box) => {
    const w = box.width / 2;
    const h = box.height / 2;
    const cut = slant(box);

    return [
      { x: -w, y: -h },
      { x: w, y: -h },
      { x: w - cut, y: h },
      { x: -w + cut, y: h },
    ];
  },
  slantedFlat,
);

const asymmetric = polygonShape(
  slantedSize,
  (box) => {
    const w = box.width / 2;
    const h = box.height / 2;
    const cut = slant(box);

    return [
      { x: -w, y: -h },
      { x: w, y: -h },
      { x: w, y: h },
      { x: -w, y: h },
      { x: -w + cut, y: 0 },
    ];
  },
  slantedFlat,
);

export const flowShapes: Readonly<Record<string, ShapeDef>> = {
  rect,
  round,
  stadium,
  subroutine,
  cylinder,
  circle,
  'double-circle': doubleCircle,
  diamond,
  hexagon,
  parallelogram,
  'parallelogram-alt': parallelogramAlt,
  trapezoid,
  'trapezoid-alt': trapezoidAlt,
  asymmetric,
};
