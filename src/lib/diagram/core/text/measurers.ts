/*
 * The two measurers. `metricsMeasurer` reads a committed advance table: deterministic, and the only
 * one used on the server, on the first client render, and in tests — that identity is what keeps SSR
 * markup and client markup byte-identical. `createSvgMeasurer` probes a live document, and is the
 * ground truth for both the post-`fonts.ready` calibration in `use-text-measurer.ts` and the dev
 * page's measurement audit.
 *
 * A canvas measurer is the obvious third and is deliberately absent: a canvas context inherits none
 * of the page's typography settings, so auditing the table against it would replace an accurate
 * answer with a less accurate one. `memoizeMeasurer` and `calibrateFont` are wrappers around the
 * two, not measurers of their own.
 */

import type { Size, TextMeasurer, TextStyle } from '../../types.ts';
import { interMetrics } from './font-metrics-inter.ts';
import type { FontMetrics } from './measure.ts';

const COMBINING = /\p{M}/u;

/** Ranges that render full-width. Everything else outside the table gets the default advance. */
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f9ff],
  [0x20000, 0x3fffd],
];

function isWide(codePoint: number): boolean {
  return WIDE_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
}

function advanceOf(font: FontMetrics, char: string): number {
  const listed = font.advances[char];

  if (listed !== undefined) {
    return listed;
  }

  if (COMBINING.test(char)) {
    return font.fallback.combining;
  }

  return isWide(char.codePointAt(0) ?? 0) ? font.fallback.cjk : font.fallback.default;
}

/** Deterministic, dependency-free, identical in Node and the browser. */
export function createMetricsMeasurer(font: FontMetrics = interMetrics): TextMeasurer {
  return {
    id: `metrics:${font.family}`,
    measure(text: string, style: TextStyle): Size {
      let em = 0;
      let count = 0;

      for (const char of text) {
        em += advanceOf(font, char);
        count += 1;
      }

      return {
        width: em * style.fontSize + count * style.letterSpacing,
        height: style.fontSize * style.lineHeight,
      };
    },
  };
}

export const metricsMeasurer: TextMeasurer = createMetricsMeasurer();

/**
 * Re-reads the advance of every glyph in `base` from a live measurer and returns a table built from
 * what it saw — the same per-character sampling the dev page's generator uses, so a calibrated table
 * and a committed one are produced the same way.
 *
 * This is what lets the post-font-load refinement stay honest without putting the browser in the
 * layout path: a measurer that reads the DOM would be called during React's render phase, once per
 * wrap candidate, forever. A table is pure, and it answers for strings that were never sampled.
 * Kerning pairs are lost, exactly as they are in the shipped table.
 */
export function calibrateFont(
  base: FontMetrics,
  measurer: TextMeasurer,
  style: TextStyle,
): FontMetrics {
  const probeStyle: TextStyle = { ...style, letterSpacing: 0 };
  const advances: Record<string, number> = {};

  for (const [char, listed] of Object.entries(base.advances)) {
    const width = measurer.measure(char, probeStyle).width;

    advances[char] = width > 0 ? width / probeStyle.fontSize : listed;
  }

  const cjk = measurer.measure('中', probeStyle).width / probeStyle.fontSize;

  return {
    ...base,
    family: `${base.family} (measured)`,
    advances,
    fallback: { ...base.fallback, cjk: cjk > 0 ? cjk : base.fallback.cjk },
  };
}

/** Most faithful (ligatures, features) and slowest; the live audits both measure through it. */
export function createSvgMeasurer(svg: SVGSVGElement): TextMeasurer {
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'text');

  probe.setAttribute('visibility', 'hidden');
  /* Without this the default white-space collapsing measures a lone " " as zero. */
  probe.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  svg.append(probe);

  return {
    id: 'svg',
    measure(text: string, style: TextStyle): Size {
      probe.setAttribute('font-size', String(style.fontSize));
      probe.setAttribute('font-family', style.fontFamily);
      probe.setAttribute('font-weight', String(style.fontWeight));
      probe.setAttribute('letter-spacing', String(style.letterSpacing));
      probe.textContent = text;

      return {
        width: probe.getComputedTextLength(),
        height: style.fontSize * style.lineHeight,
      };
    },
  };
}

/**
 * Bounded memo. Layout measures the same short strings repeatedly (wrap candidates), so the cache
 * earns its keep on one diagram; a long editing session is what the bound is for. It evicts the
 * oldest entry — a `Map` iterates in insertion order — rather than clearing wholesale, so crossing
 * the limit costs one entry instead of the entire working set.
 */
export function memoizeMeasurer(measurer: TextMeasurer, limit = 4000): TextMeasurer {
  const cache = new Map<string, Size>();

  return {
    id: measurer.id,
    measure(text: string, style: TextStyle): Size {
      const key = `${style.fontSize}|${style.fontWeight}|${style.letterSpacing}|${style.lineHeight}|${style.fontFamily}\u001F${text}`;
      const hit = cache.get(key);

      if (hit) {
        return hit;
      }

      const size = measurer.measure(text, style);

      while (cache.size >= limit) {
        const oldest = cache.keys().next();

        if (oldest.done) {
          break;
        }

        cache.delete(oldest.value);
      }

      cache.set(key, size);

      return size;
    },
  };
}
