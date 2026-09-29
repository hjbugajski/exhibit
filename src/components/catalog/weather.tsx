import { useEffect, useId, useState, type ReactNode } from 'react';

import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplet,
  Sun,
  Wind,
} from 'lucide-react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';
import type { WeatherCondition } from '@/components/catalog/weather-schema';
import { Skeleton } from '@/components/ui/skeleton';
import type { ForecastDay } from '@/lib/weather';

type Props = CatalogComponentProps<'Weather'>;
type StaticProps = Extract<Props, { source: 'static' }>;
type LiveProps = Extract<Props, { source: 'live' }>;
type Unit = 'c' | 'f';

/** The live block's fetch state. */
export type ForecastState =
  | { status: 'loading' }
  | { status: 'ready'; days: ForecastDay[] }
  | { status: 'error' };

const DEFAULT_DAY_COUNT = 5;

const conditions: Record<WeatherCondition, { icon: typeof Sun; label: string }> = {
  clear: { icon: Sun, label: 'Clear' },
  'partly-cloudy': { icon: CloudSun, label: 'Partly cloudy' },
  cloudy: { icon: Cloud, label: 'Cloudy' },
  fog: { icon: CloudFog, label: 'Fog' },
  drizzle: { icon: CloudDrizzle, label: 'Drizzle' },
  rain: { icon: CloudRain, label: 'Rain' },
  snow: { icon: CloudSnow, label: 'Snow' },
  thunderstorm: { icon: CloudLightning, label: 'Thunderstorm' },
  windy: { icon: Wind, label: 'Windy' },
};

/**
 * A fixed locale, because static strips render during SSR and a locale-dependent string would
 * hydrate as a mismatch. `signDisplay: 'negative'` keeps a rounded -0.4 from showing as "-0".
 */
const temperatureFormats: Record<Unit, Intl.NumberFormat> = {
  c: new Intl.NumberFormat('en-US', {
    style: 'unit',
    unit: 'celsius',
    unitDisplay: 'narrow',
    maximumFractionDigits: 0,
    signDisplay: 'negative',
  }),
  f: new Intl.NumberFormat('en-US', {
    style: 'unit',
    unit: 'fahrenheit',
    unitDisplay: 'narrow',
    maximumFractionDigits: 0,
    signDisplay: 'negative',
  }),
};

/** Live days only render after mount, so they can use the viewer's locale. */
const liveDateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const tileClass = 'p-card-sm flex flex-col items-center gap-2 rounded-lg border text-center';

interface Tile {
  /** Display text: authored for static days, formatted from `dateTime` for live days. */
  date: string;
  /** ISO date for `<time>`; live days only. */
  dateTime?: string;
  high: number;
  low: number;
  condition: WeatherCondition;
  precipitationChance?: number;
}

function DayTile({ tile, unit }: { tile: Tile; unit: Unit }) {
  const { icon: Icon, label } = conditions[tile.condition];
  const format = temperatureFormats[unit];

  return (
    <li className={tileClass}>
      <p className="text-foreground-muted text-xs">
        {tile.dateTime ? <time dateTime={tile.dateTime}>{tile.date}</time> : tile.date}
      </p>
      <Icon aria-hidden className="text-foreground size-5" />
      <span className="sr-only">{label}</span>
      <p className="flex flex-wrap justify-center gap-x-1.5 text-sm tabular-nums">
        <span className="text-foreground font-medium">
          <span className="sr-only">High </span>
          {format.format(tile.high)}
        </span>
        <span className="text-foreground-muted">
          <span className="sr-only">Low </span>
          {format.format(tile.low)}
        </span>
      </p>
      {/* Always rendered, so tiles with and without a chance share one height. */}
      <p className="text-foreground-muted flex h-4 items-center gap-1 text-xs tabular-nums">
        {tile.precipitationChance === undefined ? null : (
          <>
            <Droplet aria-hidden className="size-3" />
            <span className="sr-only">Chance of precipitation </span>
            {tile.precipitationChance}%
          </>
        )}
      </p>
    </li>
  );
}

/** Mirrors DayTile's line heights, so the strip does not shift when the forecast arrives. */
function SkeletonTile() {
  return (
    <li className={tileClass}>
      <Skeleton className="h-4 w-12" />
      <Skeleton className="size-5" />
      <Skeleton className="h-5 w-16" />
      <Skeleton className="h-4 w-8" />
    </li>
  );
}

/**
 * The block around a strip: optional label, the day list, an optional status slot, then the
 * summary and the data attribution. `tiles` is null when there is no list to show.
 */
function Frame({
  label,
  summary,
  attribution,
  busy,
  tiles,
  status,
}: {
  label?: string;
  summary?: string;
  attribution?: boolean;
  busy?: boolean;
  tiles: ReactNode;
  status?: ReactNode;
}) {
  const labelId = useId();

  return (
    <div className={flowBlock}>
      {label ? (
        <p className="text-foreground mb-3 text-sm font-medium" id={labelId}>
          {label}
        </p>
      ) : null}
      {tiles === null ? null : (
        <ul
          aria-busy={busy || undefined}
          aria-label={label ? undefined : 'Weather forecast'}
          aria-labelledby={label ? labelId : undefined}
          className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2"
        >
          {tiles}
        </ul>
      )}
      {status}
      {summary ? <p className="text-foreground-muted mt-3 text-sm">{summary}</p> : null}
      {attribution ? (
        <p className="text-foreground-subtle mt-3 text-xs">
          Forecast data:{' '}
          <a
            className="hover:text-foreground underline underline-offset-4"
            href="https://open-meteo.com"
            rel="noopener noreferrer"
            target="_blank"
          >
            Open-Meteo
          </a>
        </p>
      ) : null}
    </div>
  );
}

function StaticWeather({ props }: { props: StaticProps }) {
  return (
    <Frame
      label={props.label}
      summary={props.summary}
      tiles={props.days.map((day) => (
        <DayTile key={day.date} tile={day} unit={props.unit} />
      ))}
    />
  );
}

function toUnit(celsius: number, unit: Unit): number {
  return unit === 'f' ? (celsius * 9) / 5 + 32 : celsius;
}

/**
 * The live block for one fetch state. Exported so `/dev/library` can pin the loading and error
 * states, which a real fetch only shows briefly.
 */
export function LiveForecast({
  state,
  label,
  unit = 'c',
  dayCount = DEFAULT_DAY_COUNT,
}: {
  state: ForecastState;
  label?: string;
  unit?: Unit;
  dayCount?: number;
}) {
  let tiles: ReactNode = null;

  if (state.status === 'loading') {
    tiles = Array.from({ length: dayCount }, (_, i) => <SkeletonTile key={i} />);
  } else if (state.status === 'ready') {
    tiles = state.days.slice(0, dayCount).map((day) => (
      <DayTile
        key={day.date}
        tile={{
          ...day,
          date: liveDateFormat.format(new Date(`${day.date}T00:00:00Z`)),
          dateTime: day.date,
          high: toUnit(day.high, unit),
          low: toUnit(day.low, unit),
        }}
        unit={unit}
      />
    ));
  }

  return (
    <Frame
      attribution
      busy={state.status === 'loading'}
      label={label}
      status={
        // The region stays mounted, so screen readers announce the error when it appears.
        <div aria-live="polite">
          {state.status === 'error' ? (
            <p className="text-foreground-muted text-sm">
              Forecast unavailable. Reload the page to try again.
            </p>
          ) : null}
        </div>
      }
      tiles={tiles}
    />
  );
}

/**
 * Fetches through the session-guarded server fn after mount, so SSR renders the loading state. The
 * result is tagged with its coordinates: a coordinate change reads as loading until its own fetch
 * settles, with no state reset inside the effect.
 *
 * The server fn module is imported on demand: outside the client build its session middleware
 * imports Better Auth and the database, which every spec render would otherwise evaluate.
 */
function useForecast(lat: number, lng: number): ForecastState {
  const key = `${lat},${lng}`;
  const [result, setResult] = useState<{ key: string; state: ForecastState }>();

  useEffect(() => {
    let cancelled = false;
    const settle = (state: ForecastState) => {
      if (!cancelled) {
        setResult({ key: `${lat},${lng}`, state });
      }
    };

    void import('@/lib/weather')
      .then(({ getForecastFn }) => getForecastFn({ data: { lat, lng } }))
      .then(
        (days) => settle({ status: 'ready', days }),
        () => settle({ status: 'error' }),
      );

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return result?.key === key ? result.state : { status: 'loading' };
}

function LiveWeather({ props }: { props: LiveProps }) {
  const state = useForecast(props.location.lat, props.location.lng);

  return (
    <LiveForecast dayCount={props.dayCount} label={props.label} state={state} unit={props.unit} />
  );
}

export function Weather({ props }: { props: Props }) {
  return props.source === 'static' ? (
    <StaticWeather props={props} />
  ) : (
    <LiveWeather props={props} />
  );
}
