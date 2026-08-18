/*
 * Seeded mutation fuzzing. No dependency, no global RNG: the same seed always produces the same
 * corpus, so a failure found in CI reproduces exactly on a laptop.
 *
 * The point is not to find interesting diagrams — it is to prove the public entry points hold their
 * contract on damaged input. "Never throws" is the weakest half of that and was for a while the
 * only half asserted; `assertContractHolds` is the rest, and it is what a new family inherits.
 */

import { expect } from 'vitest';

import { layoutDiagram, parseDiagram, resolveLayoutOptions } from '@/lib/diagram/build.ts';
import type { Direction } from '@/lib/diagram/core/graph/model.ts';
import type { BuildOptions, Diagnostic } from '@/lib/diagram/types.ts';

import type { OutlineContext } from './invariants.ts';
import {
  assertFiniteCoordinates,
  assertGanttInvariants,
  assertLayoutInvariants,
  assertSequenceInvariants,
} from './invariants.ts';

/** Mulberry32: 32-bit state, good enough distribution, four lines. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export type MutationKind =
  | 'truncate'
  | 'flip'
  | 'drop-bracket'
  | 'duplicate-line'
  | 'insert'
  | 'inject';

const BRACKETS = '([{}])|"-.>=<';
const INSERTS = ['[', ']', '(', ')', '-->', '|', '"', '\n', '%%', '{', '}', 'end'];

/** Woman + zero-width joiner + girl: one grapheme, three code points, five UTF-16 units. */
const ZWJ_EMOJI = [0x1_f469, 0x20_0d, 0x1_f467].map((code) => String.fromCodePoint(code)).join('');

/*
 * Everything a scanner written against printable ASCII gets wrong. Named by code point rather than
 * typed as literals so this file stays plain text and the intent is readable:
 *
 *   NUL, BEL, CR, ESC, DEL   C0 controls, including the one that makes a file binary
 *   NBSP, ZWSP               spaces that are not ` `
 *   RLM, RLO                 bidi marks: reorder the rendering, not the string
 *   combining acute          a mark with nothing to combine with
 *   BOM                      zero-width no-break space in the middle of a line
 *   lone high surrogate      unpaired: no scalar value, survives no UTF-8 round trip
 *   CJK, U+10FFFF            wide, and the last code point there is
 */
const INJECTIONS: readonly string[] = [
  ...[
    0x00, 0x07, 0x0d, 0x1b, 0x7f, 0xa0, 0x20_0b, 0x20_0f, 0x20_2e, 0x03_01, 0xfe_ff, 0xd8_00,
    0x4e_2d, 0x10_ff_ff,
  ].map((code) => String.fromCodePoint(code)),
  ZWJ_EMOJI,
];

function mutateOnce(source: string, random: () => number, kind: MutationKind): string {
  if (source.length === 0) {
    return source;
  }

  const at = Math.floor(random() * source.length);

  if (kind === 'truncate') {
    return source.slice(0, at);
  }

  if (kind === 'flip') {
    const code = 32 + Math.floor(random() * 95);

    return source.slice(0, at) + String.fromCodePoint(code) + source.slice(at + 1);
  }

  if (kind === 'drop-bracket') {
    for (let i = 0; i < source.length; i += 1) {
      const index = (at + i) % source.length;

      if (BRACKETS.includes(source[index] as string)) {
        return source.slice(0, index) + source.slice(index + 1);
      }
    }

    return source;
  }

  if (kind === 'duplicate-line') {
    const lines = source.split('\n');
    const line = Math.floor(random() * lines.length);

    return [...lines.slice(0, line + 1), lines[line] ?? '', ...lines.slice(line + 1)].join('\n');
  }

  if (kind === 'inject') {
    const scalar = INJECTIONS[Math.floor(random() * INJECTIONS.length)] as string;

    return source.slice(0, at) + scalar + source.slice(at);
  }

  const insert = INSERTS[Math.floor(random() * INSERTS.length)] as string;

  return source.slice(0, at) + insert + source.slice(at);
}

const KINDS: readonly MutationKind[] = [
  'truncate',
  'flip',
  'drop-bracket',
  'duplicate-line',
  'insert',
  'inject',
];

/**
 * How many edits one mutation applies: one, two or three, drawn once. Drawing it inside the loop
 * condition instead would re-roll the bound every pass, which is a geometric distribution with no
 * upper bound rather than the documented one to three.
 */
export function editCount(random: () => number): number {
  return 1 + Math.floor(random() * 3);
}

/** `count` deterministic mutations of `source`, one to three edits each. */
export function mutations(source: string, count: number, seed = 1): string[] {
  const random = createRandom(seed);
  const out: string[] = [];

  for (let i = 0; i < count; i += 1) {
    let mutated = source;
    const edits = editCount(random);

    for (let edit = 0; edit < edits; edit += 1) {
      mutated = mutateOnce(
        mutated,
        random,
        KINDS[Math.floor(random() * KINDS.length)] as MutationKind,
      );
    }

    out.push(mutated);
  }

  return out;
}

export interface ContractOptions extends OutlineContext {
  build: BuildOptions;
}

/**
 * The public contract of `parse -> layout`, as one assert. Two clauses, and between them they cover
 * every way the pipeline is allowed to answer:
 *
 *   nothing was drawn  =>  at least one `error` diagnostic says why. A null scene with no error is
 *                          a silent failure, which the source-fallback path renders as a blank.
 *   something was drawn =>  the geometry is well formed: every number finite, no `NaN` in any path
 *                          data, and every layout invariant the engine holds for hand-written input
 *                          holds for this one too.
 *
 * An `internal-error` fails either clause. `parseDiagram` and `layoutDiagram` turn a throw into one,
 * which is right for a user but would let this assert pass on a crash, so it is named explicitly.
 *
 * The stages are run separately rather than through `buildDiagram` because the IR carries the
 * direction, and rank monotonicity cannot be checked without it — a mutated source may have moved
 * the direction token, so nothing outside the parser knows which way the graph runs.
 */
export function assertContractHolds(source: string, options: ContractOptions): void {
  const where = JSON.stringify(source);
  const noCrash = (diagnostics: readonly Diagnostic[]): void => {
    const crash = diagnostics.find((diagnostic) => diagnostic.code === 'internal-error');

    expect(crash?.message, `crashed on ${where}`).toBeUndefined();
  };
  const parsed = parseDiagram(source, {
    families: options.build.families,
    limits: options.build.limits,
  });

  noCrash(parsed.diagnostics);

  if (!parsed.ir) {
    expect(
      parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
      `nothing parsed and nothing said why: ${where}`,
    ).toBe(true);

    return;
  }

  const laid = layoutDiagram(
    parsed.ir,
    resolveLayoutOptions(options.build),
    options.build.families,
  );

  noCrash(laid.diagnostics);

  if (!laid.scene) {
    expect(
      laid.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
      `nothing was laid out and nothing said why: ${where}`,
    ).toBe(true);

    return;
  }

  if (laid.scene.kind === 'sequence') {
    assertSequenceInvariants(laid.scene);

    return;
  }

  if (laid.scene.kind === 'pie') {
    assertFiniteCoordinates(laid.scene);

    return;
  }

  if (laid.scene.kind === 'gantt') {
    assertGanttInvariants(laid.scene);

    return;
  }

  assertLayoutInvariants(laid.scene, {
    shapes: options.shapes,
    metrics: options.metrics,
    tolerance: options.tolerance,
    direction: (parsed.ir as { direction?: Direction }).direction ?? 'TB',
  });
}
