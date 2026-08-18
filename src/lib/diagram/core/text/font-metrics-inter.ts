/*
 * Generated from Chrome canvas/SVG text measurements of the shipped webfont on 2026-08-08.
 *
 * Advance widths for InterVariable at weight 400, in em. Kerning and ligatures are ignored: a
 * label is the sum of its glyph advances, and the measurement parity test guards the gap.
 *
 * Measured at `defaultMetrics.fontSize`, not at some large probe size, because Inter 4 carries an
 * `opsz` axis: the same glyph is ~9% wider at 13px than at 100px. The em values below therefore
 * describe the face as diagrams draw it (13px, optical size at its floor) and drift for a caller
 * who raises `fontSize` well past that. They also bake in the app's `font-variant-alternates`
 * (`html` in styles.css), which is why `l` is wider than a bare Inter `l`.
 *
 * Regeneration (browser only, because it needs the real loaded font):
 *   1. open /dev/library/diagram, scroll to "Measurement tooling";
 *   2. hit "Measure InterVariable" — it probes U+0020–U+007E through an in-document SVG text node
 *      and prints this module;
 *   3. paste the printed `interMetrics` object over the one below, run `pnpm fmt`, and commit it as
 *      a reviewed change. Nothing else in this file changes — the const is the whole payload.
 */

import type { FontMetrics } from './measure.ts';

export const interMetrics: FontMetrics = {
  family: 'InterVariable',
  weight: 400,
  unitsPerEm: 2048,
  ascent: 0.9688,
  descent: 0.2412,
  advances: {
    ' ': 0.2813,
    '!': 0.2879,
    '"': 0.4663,
    '#': 0.6334,
    $: 0.6418,
    '%': 0.982,
    '&': 0.6442,
    "'": 0.2999,
    '(': 0.3648,
    ')': 0.3648,
    '*': 0.5012,
    '+': 0.6617,
    ',': 0.2885,
    '-': 0.4603,
    '.': 0.2885,
    '/': 0.3606,
    0: 0.631,
    1: 0.4069,
    2: 0.61,
    3: 0.6178,
    4: 0.646,
    5: 0.5938,
    6: 0.6202,
    7: 0.5661,
    8: 0.619,
    9: 0.6202,
    ':': 0.2885,
    ';': 0.2885,
    '<': 0.6617,
    '=': 0.6617,
    '>': 0.6617,
    '?': 0.5114,
    '@': 0.9663,
    A: 0.6905,
    B: 0.6544,
    C: 0.7308,
    D: 0.7218,
    E: 0.6016,
    F: 0.5907,
    G: 0.7464,
    H: 0.7434,
    I: 0.2686,
    J: 0.5709,
    K: 0.6719,
    L: 0.5655,
    M: 0.9038,
    N: 0.7536,
    O: 0.765,
    P: 0.6388,
    Q: 0.765,
    R: 0.6436,
    S: 0.6418,
    T: 0.646,
    U: 0.7446,
    V: 0.6905,
    W: 0.9856,
    X: 0.6827,
    Y: 0.6791,
    Z: 0.6292,
    '[': 0.3648,
    '\\': 0.3606,
    ']': 0.3648,
    '^': 0.4718,
    _: 0.4561,
    '`': 0.3233,
    a: 0.5619,
    b: 0.6124,
    c: 0.5715,
    d: 0.6124,
    e: 0.5835,
    f: 0.3702,
    g: 0.6136,
    h: 0.5913,
    i: 0.2422,
    j: 0.2422,
    k: 0.5493,
    l: 0.2758,
    m: 0.8762,
    n: 0.5913,
    o: 0.5998,
    p: 0.6124,
    q: 0.6124,
    r: 0.3768,
    s: 0.5282,
    t: 0.3275,
    u: 0.5913,
    v: 0.5625,
    w: 0.8185,
    x: 0.5463,
    y: 0.5625,
    z: 0.5523,
    '{': 0.4267,
    '|': 0.3329,
    '}': 0.4267,
    '~': 0.6617,
  },
  fallback: { cjk: 1, combining: 0, default: 0.55 },
};
