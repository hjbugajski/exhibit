import { useMemo } from 'react';

import { areaY, barY, defineChart, dot, lineY } from '@tanstack/charts';
import type { ChannelAccessorContext, ChartPoint } from '@tanstack/charts';
import { d3Curve } from '@tanstack/charts/d3/shape';
import { polar, radialArc } from '@tanstack/charts/polar';
import { Chart } from '@tanstack/charts/react';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip } from '@tanstack/charts/tooltip';
import { curveMonotoneX, pie } from 'd3-shape';
import type { PieArcDatum } from 'd3-shape';

import type { CatalogComponentProps } from '@/catalog/catalog';

type Props = CatalogComponentProps<'Chart'>;
type Point = Props['data'][number];
type CartesianKind = Exclude<Props['kind'], 'donut'>;

/**
 * Slice colors for the polar kinds. The library's default palette only defines six entries
 * (`--ts-chart-1..6`), so the full house ramp is supplied on the definition — `var()` strings are
 * valid SVG paint, so a scheme switch still recolors the slices.
 */
const SLICE_PALETTE = Array.from({ length: 8 }, (_, index) => `var(--color-chart-${index + 1})`);

const CHART_PROPS = { className: 'catalog-chart', height: 256, initialWidth: 640 } as const;

interface KindChartProps {
  data: Props['data'];
  label: string;
  seriesName: string;
}

/* Split by datum generic: polar marks carry d3 pie slices while the cartesian kinds plot Points,
   so each component holds one fully-typed definition. */

function CartesianChart({
  data,
  kind,
  label,
  seriesName,
}: KindChartProps & { kind: CartesianKind }) {
  const definition = useMemo(() => {
    /* `content` outranks the automatic item layout, so the category heads the tooltip as a bold
       title and the value gets a labelled row of its own. */
    const tooltipSpec = {
      use: tooltip,
      className: 'catalog-chart-tooltip',
      content: (points: readonly ChartPoint<Point>[]) => {
        const point = points[0];

        if (!point) {
          return { rows: [] };
        }

        return {
          title: point.datum.label,
          rows: [
            {
              label: seriesName,
              value: point.datum.value.toLocaleString(),
              color: point.color,
            },
          ],
        };
      },
    };
    const y = { scale: scaleLinear, nice: true, grid: true };
    /* x is the point's index, not its label: labels may repeat (Q1 of two years) and a
       label-keyed scale would stack repeats in one slot. The axis prints the label back. Marks
       that plot a position rather than a band sit on a point scale. */
    const byIndex = (_: Point, { index }: ChannelAccessorContext<Point>) => index;
    const axis = { ticks: { format: (index: number) => data[index]?.label ?? '' } };
    const x = { scale: () => scalePoint<number>(), axis };
    const curve = d3Curve(curveMonotoneX);

    switch (kind) {
      case 'bar':
        return defineChart({
          marks: [
            // Rounds all four corners alike; `BarRadius` also takes per-corner or value-end radii.
            barY(data, { x: byIndex, y: 'value', radius: 2 }),
          ],
          scales: { x: { scale: () => scaleBand<number>().padding(0.18), axis }, y },
          tooltip: tooltipSpec,
        });
      case 'area':
        return defineChart({
          // areaY fills at 0.2 opacity and draws no edge, so the line rides on top of it.
          marks: [
            areaY(data, { x: byIndex, y: 'value', curve }),
            lineY(data, { x: byIndex, y: 'value', curve, strokeWidth: 2 }),
          ],
          scales: { x, y },
          tooltip: tooltipSpec,
        });
      case 'scatter':
        return defineChart({
          marks: [dot(data, { x: byIndex, y: 'value', r: 3.5 })],
          scales: { x, y },
          tooltip: tooltipSpec,
        });
      default:
        return defineChart({
          marks: [lineY(data, { x: byIndex, y: 'value', curve, strokeWidth: 2 })],
          scales: { x, y },
          tooltip: tooltipSpec,
        });
    }
  }, [data, kind, seriesName]);

  return <Chart {...CHART_PROPS} ariaLabel={label} definition={definition} />;
}

function DonutChart({ data, label, seriesName }: KindChartProps) {
  const definition = useMemo(() => {
    /* d3's pie layout emits the exact angle channels radialArc reads; the donut hole is just a
       nonzero inner radius. Source order is meaningful, hence sort(null). */
    const slices = pie<Point>()
      .sort(null)
      .padAngle(0.012)
      .value((point) => point.value)(data);
    const sliceOf = (focused: ChartPoint<unknown>) => (focused.datum as PieArcDatum<Point>).data;

    return defineChart({
      marks: [
        polar({
          inset: 8,
          marks: [
            radialArc(slices, {
              innerRadius: ({ radius }) => radius * 0.58,
              cornerRadius: 2,
              // Keyed by position so slices that share a label still get their own color.
              color: (slice) => slice.index,
              key: (slice) => slice.index,
            }),
          ],
          scales: { angle: null, radius: null },
        }),
      ],
      guides: false,
      scales: { x: null, y: null },
      theme: { palette: SLICE_PALETTE },
      tooltip: {
        use: tooltip,
        className: 'catalog-chart-tooltip',
        content: (points: readonly ChartPoint<unknown>[]) => {
          const focused = points[0];

          if (!focused) {
            return { rows: [] };
          }

          const slice = sliceOf(focused);

          return {
            title: slice.label,
            color: focused.color,
            rows: [{ label: seriesName, value: slice.value.toLocaleString() }],
          };
        },
      },
    });
  }, [data, seriesName]);

  return <Chart {...CHART_PROPS} ariaLabel={label} definition={definition} />;
}

/**
 * Default export (the only one in the catalog) because chart.tsx lazy-loads this module via
 * React.lazy, which requires a default export.
 *
 * Paint comes from CSS: the library's default theme is `currentColor` plus `--ts-chart-*` custom
 * properties, both mapped to house tokens by the `.catalog-chart` rule in styles.css, so a scheme
 * switch recolors the chart without rebuilding the definition.
 */
export default function CatalogChartInner({ props }: { props: Props }) {
  const { data, kind } = props;
  const seriesName = props.valueLabel ?? 'value';
  const chartLabel = `${seriesName} ${kind} chart, ${data.length} data points`;

  return (
    <>
      {kind === 'donut' ? (
        <DonutChart data={data} label={chartLabel} seriesName={seriesName} />
      ) : (
        <CartesianChart data={data} kind={kind} label={chartLabel} seriesName={seriesName} />
      )}
      {/* The plotted values are only reachable by hover/keyboard tooltip, so the same series is
          repeated as a table for assistive tech. */}
      <table className="sr-only">
        <caption>{chartLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Label</th>
            <th scope="col">{seriesName}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point, index) => (
            <tr key={`${point.label}-${index}`}>
              <th scope="row">{point.label}</th>
              <td>{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
