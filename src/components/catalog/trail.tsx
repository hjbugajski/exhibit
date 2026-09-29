import type { CatalogComponentProps } from '@/catalog/catalog';
import { Chart } from '@/components/catalog/chart';
import { flowBlock } from '@/components/catalog/flow';
import { KeyValueList } from '@/components/catalog/key-value-list';
import { Map } from '@/components/catalog/map';
import { MarkdownBody } from '@/components/catalog/markdown-body';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card as UiCard } from '@/components/ui/card';

type Props = CatalogComponentProps<'Trail'>;
type Distance = Props['distance'];
type LengthUnit = Distance['unit'] | Props['elevationGain']['unit'];

const intlUnits: Record<LengthUnit, string> = {
  km: 'kilometer',
  mi: 'mile',
  m: 'meter',
  ft: 'foot',
};

/** Badge tone per grade. Set every value to 'default' for a monochrome badge. */
const difficultyVariants: Record<Props['difficulty'], NonNullable<BadgeProps['variant']>> = {
  easy: 'success',
  moderate: 'info',
  hard: 'warning',
  strenuous: 'danger',
};

const difficultyLabels: Record<Props['difficulty'], string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  hard: 'Hard',
  strenuous: 'Strenuous',
};

const routeLabels: Record<Props['routeType'], string> = {
  loop: 'Loop',
  'out-and-back': 'Out and back',
  'point-to-point': 'Point to point',
};

function lengthFormat(unit: LengthUnit, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return new Intl.NumberFormat('en-US', {
    style: 'unit',
    unit: intlUnits[unit],
    unitDisplay: 'short',
    ...options,
  });
}

/**
 * A fixed locale, because the stats render during SSR and a locale-dependent string would hydrate
 * as a mismatch. Catalog copy is English.
 */
const statFormats = Object.fromEntries(
  Object.keys(intlUnits).map((unit) => [
    unit,
    lengthFormat(unit as LengthUnit, { maximumFractionDigits: 1 }),
  ]),
) as Record<LengthUnit, Intl.NumberFormat>;

/**
 * Pairs each elevation sample with its distance from the start, as the chart's x labels. Uses the
 * fewest fraction digits (1 to 3) that keep every label unique, else 3.
 */
export function elevationSeries(
  profile: number[],
  distance: Distance,
): { label: string; value: number }[] {
  const seriesAt = (digits: number) => {
    const format = lengthFormat(distance.unit, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

    return profile.map((value, index) => ({
      label: format.format((distance.value * index) / (profile.length - 1)),
      value,
    }));
  };

  for (const digits of [1, 2]) {
    const series = seriesAt(digits);

    if (new Set(series.map((point) => point.label)).size === series.length) {
      return series;
    }
  }

  return seriesAt(3);
}

export function Trail({ props }: { props: Props }) {
  const stats = [
    {
      id: 'distance',
      key: 'Distance',
      value: statFormats[props.distance.unit].format(props.distance.value),
    },
    {
      id: 'elevation-gain',
      key: 'Elevation gain',
      value: statFormats[props.elevationGain.unit].format(props.elevationGain.value),
    },
    ...(props.duration ? [{ id: 'duration', key: 'Duration', value: props.duration }] : []),
    { id: 'route', key: 'Route', value: routeLabels[props.routeType] },
  ];
  const hasMap = Boolean(props.track?.length || props.waypoints?.length);

  return (
    <UiCard.Root className={flowBlock}>
      <UiCard.Header>
        <UiCard.Title level={3}>{props.name}</UiCard.Title>
        <UiCard.Action>
          <Badge variant={difficultyVariants[props.difficulty]}>
            {difficultyLabels[props.difficulty]}
          </Badge>
        </UiCard.Action>
      </UiCard.Header>
      <UiCard.Content>
        <KeyValueList props={{ items: stats, columns: 2 }} />
        {hasMap ? (
          <Map
            props={{
              markers: props.waypoints,
              paths: props.track ? [{ id: 'track', points: props.track }] : undefined,
            }}
          />
        ) : null}
        {props.elevationProfile ? (
          <Chart
            props={{
              kind: 'area',
              valueLabel: `Elevation (${props.elevationGain.unit})`,
              data: elevationSeries(props.elevationProfile, props.distance),
            }}
          />
        ) : null}
        {props.markdown ? <MarkdownBody className={flowBlock} markdown={props.markdown} /> : null}
      </UiCard.Content>
    </UiCard.Root>
  );
}
