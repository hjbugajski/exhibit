/*
 * Measurer selection. The deterministic table measurer is the default everywhere — server, first
 * client render, tests — which is what keeps SSR markup and hydrated markup byte-identical.
 *
 * The refinement is single-shot by construction: after `document.fonts.ready`, the longest labels
 * in the drawn scene are re-measured against the browser; if the table is off by more than 2%
 * anywhere, the probe's advances are read once into a *table of their own* and that replaces the
 * shipped one (`measurer.id` is part of the layout memo key, so exactly one re-layout follows). It
 * cannot oscillate because the replacement never hands control back.
 *
 * Handing the probe itself to layout would have been simpler and wrong: `layoutDiagram` runs inside
 * a `useMemo` during render, so every wrap candidate would become a forced synchronous layout in
 * React's render phase, forever. A calibrated table is pure — the browser is read 95 times, once,
 * inside an effect, and never again.
 *
 * The audit is keyed on `(metrics, measurer)`, not on the scene: it samples labels to decide which
 * measurer is right, and that answer does not change when the drawing does. Keying it on the scene
 * scheduled a fresh `fonts.ready` audit on every keystroke.
 *
 * Ground truth is an in-document SVG probe, not a canvas: a canvas context inherits none of the
 * page's typography settings — this app asks for `font-variant-alternates` on `html` — so it
 * disagrees with the drawn glyphs by more than the shipped table does. Auditing against it would
 * trade an accurate table for a less accurate measurer. The probe is also how the table was
 * generated, so the two agree by construction.
 */

import { useEffect, useRef } from 'react';

import { interMetrics } from '@/lib/diagram/core/text/font-metrics-inter';
import { textStyle } from '@/lib/diagram/core/text/measure';
import {
  calibrateFont,
  createMetricsMeasurer,
  createSvgMeasurer,
  memoizeMeasurer,
  metricsMeasurer,
} from '@/lib/diagram/core/text/measurers';
import type { DiagramMetrics } from '@/lib/diagram/metrics';
import type { Scene, SceneCluster, TextMeasurer, TextStyle } from '@/lib/diagram/types';

/** How many of the widest labels to audit — enough to catch a wrong table, cheap enough to ignore. */
const SAMPLE_SIZE = 12;

/** Relative width error the table is allowed before the rendered measurer takes over. */
const ERROR_THRESHOLD = 0.02;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * One hidden probe per document, shared by every diagram on the page: it has to stay attached for
 * the lifetime of the measurer, because `getComputedTextLength` on a detached node is 0.
 */
let probeSvg: SVGSVGElement | null = null;
let probeMeasurer: TextMeasurer | null = null;

/** Null wherever text cannot be measured — a test environment, or SVG without metrics. */
function renderedMeasurer(style: TextStyle): TextMeasurer | null {
  if (probeSvg?.isConnected && probeMeasurer) {
    return probeMeasurer;
  }

  probeMeasurer = null;

  if (typeof document === 'undefined' || !document.body) {
    return null;
  }

  const svg = document.createElementNS(SVG_NS, 'svg');

  /*
   * Zero-sized and pinned to the origin. An `svg` with no width/height falls back to the spec's
   * 300x150 default, and one parked at the end of `body` stretched every page carrying a diagram by
   * exactly 150px of blank scroll. `getComputedTextLength` shapes the run rather than reading the
   * viewport, so clipping the probe to nothing costs no accuracy.
   */
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = '0';
  svg.style.height = '0';
  svg.style.overflow = 'hidden';
  svg.style.visibility = 'hidden';
  svg.style.pointerEvents = 'none';
  document.body.append(svg);

  try {
    const measurer = createSvgMeasurer(svg);

    if (measurer.measure('MMMM', style).width > 0) {
      probeSvg = svg;
      probeMeasurer = memoizeMeasurer(measurer);
    }
  } catch {
    probeMeasurer = null;
  }

  if (!probeMeasurer) {
    svg.remove();
  }

  return probeMeasurer;
}

function collectClusters(clusters: readonly SceneCluster[], into: string[]): void {
  for (const cluster of clusters) {
    into.push(...(cluster.title?.box.lines ?? []));
    collectClusters(cluster.children, into);
  }
}

function collectLabels(scene: Scene): string[] {
  const texts: string[] = [];

  if (scene.kind === 'pie') {
    for (const item of scene.legend) {
      texts.push(item.label);
    }

    return texts;
  }

  if (scene.kind === 'sequence') {
    for (const participant of scene.participants) {
      texts.push(...participant.label.lines);
    }

    for (const message of scene.messages) {
      texts.push(...(message.label?.box.lines ?? []));
    }

    for (const note of scene.notes) {
      texts.push(...note.label.box.lines);
    }

    for (const frame of scene.frames) {
      texts.push(...(frame.label?.box.lines ?? []));
    }

    return texts;
  }

  for (const node of scene.nodes) {
    texts.push(...node.label.lines);
  }

  for (const edge of scene.edges) {
    texts.push(...(edge.label?.box.lines ?? []));
  }

  collectClusters(scene.clusters, texts);

  return texts;
}

/**
 * Widest-first sample. Long strings accumulate the most absolute error, so they are where a wrong
 * advance table shows up first.
 */
function longestLabels(scene: Scene): string[] {
  const unique = [...new Set(collectLabels(scene).filter((text) => text.length > 0))];

  return unique.sort((a, b) => b.length - a.length).slice(0, SAMPLE_SIZE);
}

export function useRefinedMeasurer(
  scene: Scene | null,
  metrics: DiagramMetrics,
  enabled: boolean,
  onRefine: (measurer: TextMeasurer) => void,
): void {
  // Whatever is drawn when the fonts settle is a fine sample; the effect must not re-run for it.
  const latest = useRef(scene);

  latest.current = scene;

  const drawn = scene !== null;

  useEffect(() => {
    if (!enabled || !drawn || typeof document === 'undefined') {
      return;
    }

    let cancelled = false;

    const audit = () => {
      const current = latest.current;
      const samples = current ? longestLabels(current) : [];
      const style = textStyle(metrics);
      const rendered = cancelled || samples.length === 0 ? null : renderedMeasurer(style);

      if (!rendered) {
        return;
      }

      let worst = 0;

      for (const text of samples) {
        const actual = rendered.measure(text, style).width;

        if (actual > 0) {
          worst = Math.max(
            worst,
            Math.abs(metricsMeasurer.measure(text, style).width - actual) / actual,
          );
        }
      }

      if (worst > ERROR_THRESHOLD) {
        onRefine(createMetricsMeasurer(calibrateFont(interMetrics, rendered, style)));
      }
    };

    if (document.fonts) {
      void document.fonts.ready.then(audit, () => {});
    } else {
      audit();
    }

    return () => {
      cancelled = true;
    };
  }, [enabled, drawn, metrics, onRefine]);
}
