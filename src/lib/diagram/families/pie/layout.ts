/*
 * Pie layout. Declaration order is preserved (mermaid never sorts), the sweep starts at twelve
 * o'clock, and arc maths comes from `core/geometry/arc.ts` — no chart dependency.
 *
 * The legend carries no geometry on purpose: the React layer decides whether it is SVG beside the
 * chart or HTML below it. Slice colour is a `swatchIndex` into the series custom properties, never a
 * value in the scene.
 */

import { Reporter } from '../../core/diagnostics.ts';
import type { ArcSpec } from '../../core/geometry/arc.ts';
import { arcCentroid, arcD } from '../../core/geometry/arc.ts';
import { textStyle, wrapLabel } from '../../core/text/measure.ts';
import type {
  LayoutOptions,
  LayoutResult,
  PieScene,
  SceneLegendItem,
  SceneSlice,
} from '../../types.ts';
import type { PieIR } from './ir.ts';

/** Slice palette size; the React layer maps an index onto `--diagram-series-N`. */
export const PIE_SERIES_COUNT = 8;

/** Radius in ems, so a metrics override that scales type scales the chart with it. */
const RADIUS_EM = 10;

/** Fraction of the radius the centroid label sits at — matches `arcCentroid`'s default. */
const CENTROID_RATIO = 0.68;

/** Radial room a centroid label may use before it is demoted to the legend. */
const LABEL_BAND = 0.5;

const FULL = Math.PI * 2;

/**
 * A centroid label has to fit the slice both ways: across the chord at the centroid radius, and
 * within the band the ring leaves it. Anything else moves to the legend only.
 */
function fits(width: number, height: number, radius: number, sweep: number): boolean {
  const chord = 2 * CENTROID_RATIO * radius * Math.sin(Math.min(sweep, Math.PI) / 2);

  return width <= chord && height <= radius * LABEL_BAND;
}

export function layoutPie(ir: PieIR, options: LayoutOptions): LayoutResult<PieScene> {
  const report = new Reporter();
  const m = options.metrics;
  const style = textStyle(m);

  if (ir.slices.length > options.limits.nodes) {
    report.error(
      'too-many-nodes',
      `Pie chart has ${ir.slices.length} slices; the limit is ${options.limits.nodes}.`,
    );

    return { scene: null, diagnostics: report.diagnostics };
  }

  const total = ir.slices.reduce((sum, entry) => sum + entry.value, 0);

  if (ir.slices.length === 0) {
    report.warn('empty-diagram', 'The pie chart has no slices.');
  } else if (total <= 0) {
    report.warn('zero-total', 'Every slice value is zero, so no arcs are drawn.');
  }

  const drawable = total > 0;
  const radius = drawable ? m.fontSize * RADIUS_EM : 0;
  const center = { x: m.padding + radius, y: m.padding + radius };
  const slices: SceneSlice[] = [];
  const legend: SceneLegendItem[] = [];
  let angle = -Math.PI / 2;

  for (const [index, entry] of ir.slices.entries()) {
    const fraction = drawable ? entry.value / total : 0;
    const swatchIndex = index % PIE_SERIES_COUNT;

    legend.push({
      id: `slice-${index}`,
      label: entry.label,
      value: entry.value,
      fraction,
      swatchIndex,
    });

    if (!drawable || fraction === 0) {
      continue;
    }

    const sweep = fraction * FULL;
    const spec: ArcSpec = {
      center,
      outerRadius: radius,
      innerRadius: 0,
      startAngle: angle,
      endAngle: angle + sweep,
    };
    const slice: SceneSlice = {
      id: `slice-${index}`,
      label: entry.label,
      value: entry.value,
      fraction,
      startAngle: spec.startAngle,
      endAngle: spec.endAngle,
      d: arcD(spec),
      swatchIndex,
    };
    const label = wrapLabel([entry.label], style, options.measurer, m.maxLabelWidth);

    if (label.lines.length > 0 && fits(label.width, label.height, radius, sweep)) {
      slice.labelBox = label;
      slice.labelPoint = arcCentroid(spec, CENTROID_RATIO);
    }

    slices.push(slice);
    angle += sweep;
  }

  const scene: PieScene = {
    kind: 'pie',
    family: 'pie',
    size: { width: radius * 2 + m.padding * 2, height: radius * 2 + m.padding * 2 },
    center,
    radius,
    slices,
    legend,
    showData: ir.showData,
  };
  const title = ir.title ?? ir.accTitle;

  if (title !== undefined) {
    scene.title = title;
  }

  // Only a `title` line is a caption: `accTitle` names the drawing for a screen reader and is never
  // drawn, the same way `accDescr` stays invisible.
  if (ir.title !== undefined) {
    scene.caption = ir.title;
  }

  if (ir.accDescr !== undefined) {
    scene.description = ir.accDescr;
  }

  return { scene, diagnostics: report.diagnostics };
}
