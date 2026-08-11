/*
 * Label wrapping and the font-metrics shape the deterministic measurer consumes. Wrapping happens
 * once, during layout, and the lines it returns are exactly the lines the renderer emits — so what
 * was measured is what is drawn.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { LabelBox, TextMeasurer, TextStyle } from '../../types.ts';

export interface FontMetrics {
  readonly family: string;
  /**
   * The weight these advances describe. Inter is variable, so a table is only true at one weight —
   * this is what lets a caller be told that `metrics.fontWeight` is not the weight anything was
   * measured at, rather than silently drawing bold glyphs in boxes sized for regular.
   */
  readonly weight: number;
  readonly unitsPerEm: number;
  /** Em fractions from the font's hhea table. */
  readonly ascent: number;
  readonly descent: number;
  /** Advance widths in em, keyed by character, U+0020–U+007E. */
  readonly advances: Readonly<Record<string, number>>;
  /** Em advances for codepoints outside the table, bucketed by Unicode range. */
  readonly fallback: {
    readonly cjk: number;
    readonly combining: number;
    readonly default: number;
  };
}

/**
 * Distance in em from a line box's vertical center down to the alphabetic baseline, i.e.
 * (ascent − descent) / 2 for Inter. Text is centered on the box, so this is what turns a line
 * index into a `<text>` y.
 */
const BASELINE_FROM_CENTER = 0.36;

/**
 * The three type roles a drawing has. Weight and family are shared — only size and tracking differ,
 * because the shipped advance table is one 400 table and a second weight would mis-measure.
 */
export type TextRole = 'node' | 'edgeLabel' | 'clusterTitle';

/**
 * The style a role is measured with. `diagram.css` renders each role from the same numbers, written
 * onto the figure as custom properties, so what was measured is what is drawn.
 */
export function textStyle(m: DiagramMetrics, role: TextRole = 'node'): TextStyle {
  return {
    fontSize:
      role === 'edgeLabel'
        ? m.edgeLabelFontSize
        : role === 'clusterTitle'
          ? m.clusterTitleFontSize
          : m.fontSize,
    fontFamily: m.fontFamily,
    fontWeight: m.fontWeight,
    letterSpacing: role === 'clusterTitle' ? m.clusterTitleLetterSpacing : m.letterSpacing,
    lineHeight: m.lineHeight,
  };
}

/**
 * How far past `maxWidth` an unbreakable word may run before it is cut. Letting the node grow is
 * the right answer for a long word and a catastrophe for a pasted 10 000-character string: measured,
 * one such label produced a 71 063 × 54 scene, which under `fit="scale"` is a 1.4px thread.
 */
const CLAMP_FACTOR = 4;

/** Longest prefix of `text` that fits `limit` once an ellipsis is appended. */
function clampLine(text: string, style: TextStyle, measurer: TextMeasurer, limit: number): string {
  // Code points, not UTF-16 units: cutting a surrogate pair in half would emit a lone surrogate.
  const chars: string[] = [];

  for (const char of text) {
    chars.push(char);
  }

  let low = 0;
  let high = chars.length;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);

    if (measurer.measure(`${chars.slice(0, mid).join('')}…`, style).width <= limit) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return `${chars.slice(0, low).join('')}…`;
}

/**
 * Explicit breaks win, then greedy word wrap to `maxWidth`. A single word wider than `maxWidth` is
 * never broken — the node grows instead, up to `CLAMP_FACTOR` times the wrap width, past which the
 * word is cut and `onClamp` is called with that ceiling, once per cut line. Whitespace-only lines
 * are dropped.
 */
export function wrapLabel(
  lines: readonly string[],
  style: TextStyle,
  measurer: TextMeasurer,
  maxWidth: number,
  onClamp?: (ceiling: number) => void,
): LabelBox {
  const limit = maxWidth > 0 ? maxWidth : Number.POSITIVE_INFINITY;
  const ceiling = limit * CLAMP_FACTOR;
  const lineHeight = style.fontSize * style.lineHeight;
  const wrapped: string[] = [];

  for (const raw of lines) {
    const text = raw.trim();

    if (!text) {
      continue;
    }

    let current = '';

    for (const word of text.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;

      if (current && measurer.measure(candidate, style).width > limit) {
        wrapped.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }

    if (current) {
      wrapped.push(current);
    }
  }

  let width = 0;

  for (const [index, line] of wrapped.entries()) {
    let measured = measurer.measure(line, style).width;

    if (measured > ceiling) {
      const cut = clampLine(line, style, measurer, ceiling);

      wrapped[index] = cut;
      measured = measurer.measure(cut, style).width;
      onClamp?.(ceiling);
    }

    width = Math.max(width, measured);
  }

  return {
    lines: wrapped,
    width,
    height: wrapped.length * lineHeight,
    lineHeight,
    baseline: lineHeight / 2 + style.fontSize * BASELINE_FROM_CENTER,
  };
}
