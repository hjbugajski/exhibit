import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import { LiveForecast } from '@/components/catalog/weather';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

type Unit = 'c' | 'f';

/** Central Kyoto, as in the Map demo. */
const kyoto = { lat: 35.0116, lng: 135.7681 };

/** Authored in °C; the °F variant converts, as a spec author would. */
const staticDays = [
  { date: 'Sat, May 2', high: 24, low: 16, condition: 'clear', precipitationChance: 0 },
  { date: 'Sun, May 3', high: 22, low: 15, condition: 'partly-cloudy', precipitationChance: 10 },
  { date: 'Mon, May 4', high: 19, low: 14, condition: 'rain', precipitationChance: 70 },
  { date: 'Tue, May 5', high: 21, low: 13, condition: 'cloudy', precipitationChance: 20 },
  { date: 'Wed, May 6', high: 23, low: 15, condition: 'windy' },
];

function toFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

function specOf(props: Record<string, unknown>): Spec {
  return { root: 'weather', elements: { weather: { type: 'Weather', props, children: [] } } };
}

function staticSpec(unit: Unit): Spec {
  return specOf({
    source: 'static',
    unit,
    label: 'Kyoto, early May',
    summary: 'Pack a light rain shell for Monday.',
    days:
      unit === 'c'
        ? staticDays
        : staticDays.map((day) => ({
            ...day,
            high: toFahrenheit(day.high),
            low: toFahrenheit(day.low),
          })),
  });
}

function liveSpec(unit: Unit): Spec {
  return specOf({ source: 'live', location: kyoto, label: 'Kyoto', unit });
}

/** Built once, so each playground render hands SpecView the same spec. */
const specs: Record<'static' | 'live', Record<Unit, Spec>> = {
  static: { c: staticSpec('c'), f: staticSpec('f') },
  live: { c: liveSpec('c'), f: liveSpec('f') },
};

function WeatherDemo() {
  return (
    <Playground
      controls={{
        source: {
          kind: 'select',
          label: 'Source',
          options: ['static', 'live', 'live (loading)', 'live (error)'],
          defaultValue: 'static',
        },
        unit: { kind: 'select', label: 'Unit', options: ['c', 'f'], defaultValue: 'c' },
      }}
      layout="block"
      render={({ source, unit }) => {
        // The pinned states render the live block directly; a real fetch shows them only briefly.
        if (source === 'live (loading)') {
          return <LiveForecast label="Kyoto" state={{ status: 'loading' }} unit={unit} />;
        }

        if (source === 'live (error)') {
          return <LiveForecast label="Kyoto" state={{ status: 'error' }} unit={unit} />;
        }

        return <SpecView spec={specs[source][unit]} />;
      }}
    />
  );
}

export const catalogWeatherDemo: LibraryDemo = {
  slug: 'catalog-weather',
  title: 'Weather',
  description:
    'Daily forecast strip. Static days come from the spec; live days come from Open-Meteo through the server.',
  group: 'Catalog',
  render: () => <WeatherDemo />,
};
