import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { CatalogComponentProps } from '@/catalog/catalog';

type Props = CatalogComponentProps<'Chart'>;

/**
 * Recharts takes SVG paint values, not classes, so the app tokens are passed as CSS variables to
 * follow the design system (including dark mode).
 */
const axisProps = {
  axisLine: { stroke: 'var(--color-border)' },
  tick: { fill: 'var(--color-foreground-muted)', fontSize: 12 },
  tickLine: false as const,
};

const tooltipProps = {
  contentStyle: {
    background: 'var(--color-surface-raised)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-foreground)',
    fontSize: 12,
  },
  cursor: { fill: 'var(--color-surface-muted)', opacity: 0.5 },
};

/**
 * Default export (the only one in the catalog) because chart.tsx lazy-loads this module via
 * React.lazy, which requires a default export.
 */
export default function CatalogChartInner({ props }: { props: Props }) {
  const seriesName = props.valueLabel ?? 'value';
  const chartLabel = `${seriesName} ${props.kind} chart, ${props.data.length} data points`;

  return (
    <>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          {props.kind === 'bar' ? (
            <BarChart aria-label={chartLabel} data={props.data}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis width={40} {...axisProps} />
              <Tooltip {...tooltipProps} />
              <Bar
                dataKey="value"
                fill="var(--color-chart-1)"
                name={seriesName}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          ) : (
            <LineChart aria-label={chartLabel} data={props.data}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis width={40} {...axisProps} />
              <Tooltip {...tooltipProps} cursor={{ stroke: 'var(--color-border)' }} />
              <Line
                dataKey="value"
                dot={false}
                name={seriesName}
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                type="monotone"
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
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
          {props.data.map((point, index) => (
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
