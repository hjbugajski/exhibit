/*
 * State-diagram markers. All but the note are label-less and fixed-size: their whole job is to be
 * recognizable at a glance, so they ignore the measured label entirely.
 */

import type { Point, ShapeDef, Size } from '../../types.ts';
import { rayEllipse, rayPolygon } from '../geometry/intersect.ts';
import { ellipseD, polygonD, rectD, round2 } from '../geometry/path.ts';
import { ellipseSides } from './sides.ts';

const START_SIZE = 14;
const END_SIZE = 18;
const END_RING_GAP = 3;
const CHOICE_SIZE = 28;
const BAR_LENGTH = 80;
const BAR_THICKNESS = 8;
const NOTE_FOLD = 10;

function fixed(width: number, height = width): ShapeDef['size'] {
  return () => ({ width, height });
}

const stateStart: ShapeDef = {
  size: fixed(START_SIZE),
  outline: (box) => ellipseD(box.width / 2, box.height / 2),
  anchor: (box, toward) => rayEllipse(box.width / 2, box.height / 2, toward),
  sides: ellipseSides,
};

const stateEnd: ShapeDef = {
  size: fixed(END_SIZE),
  outline: (box) => {
    const outer = box.width / 2;

    return `${ellipseD(outer, outer)}${ellipseD(outer - END_RING_GAP, outer - END_RING_GAP)}`;
  },
  anchor: (box, toward) => rayEllipse(box.width / 2, box.height / 2, toward),
  sides: ellipseSides,
};

function diamondCorners(box: Size): Point[] {
  return [
    { x: 0, y: -box.height / 2 },
    { x: box.width / 2, y: 0 },
    { x: 0, y: box.height / 2 },
    { x: -box.width / 2, y: 0 },
  ];
}

const stateChoice: ShapeDef = {
  size: fixed(CHOICE_SIZE),
  outline: (box) => polygonD(diamondCorners(box)),
  anchor: (box, toward) => rayPolygon(diamondCorners(box), toward),
  ports: 'vertex',
};

/**
 * Fork and join share this bar. `spread` is what makes it a connector rather than a very flat node:
 * the engine turns it to lie across the flow whatever the direction, and spreads its edges along it.
 */
const stateBar: ShapeDef = {
  size: fixed(BAR_LENGTH, BAR_THICKNESS),
  outline: (box) => rectD(box, BAR_THICKNESS / 2),
  ports: 'spread',
};

/** Note flag: a rectangle with the top-right corner folded. */
const stateNote: ShapeDef = {
  size: (label, m) => ({
    width: Math.max(m.minNodeWidth, label.width + m.nodePaddingX * 2 + NOTE_FOLD),
    height: Math.max(m.minNodeHeight, label.height + m.nodePaddingY * 2),
  }),
  outline: (box) => {
    const w = box.width / 2;
    const h = box.height / 2;
    const body = polygonD([
      { x: -w, y: -h },
      { x: w - NOTE_FOLD, y: -h },
      { x: w, y: -h + NOTE_FOLD },
      { x: w, y: h },
      { x: -w, y: h },
    ]);
    const fold =
      `M${round2(w - NOTE_FOLD)},${round2(-h)}` +
      `L${round2(w - NOTE_FOLD)},${round2(-h + NOTE_FOLD)}L${round2(w)},${round2(-h + NOTE_FOLD)}`;

    return `${body}${fold}`;
  },
  // Symmetric about both axes even though only the top right corner is folded away: a port that
  // stays a fold clear of every corner cannot land on the fold whichever side it is on. The fold is
  // a cut, not an arc, so nothing may ride past it.
  sides: (box) => ({
    flat: {
      width: Math.max(0, box.width - NOTE_FOLD * 2),
      height: Math.max(0, box.height - NOTE_FOLD * 2),
    },
    corner: 0,
  }),
};

export const stateShapes: Readonly<Record<string, ShapeDef>> = {
  'state-start': stateStart,
  'state-end': stateEnd,
  'state-choice': stateChoice,
  'state-bar': stateBar,
  'state-note': stateNote,
};
