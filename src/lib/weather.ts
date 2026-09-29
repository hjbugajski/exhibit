import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { FORECAST_DAYS_MAX, type WeatherCondition } from '@/components/catalog/weather-schema';
import { sessionMiddleware } from '@/lib/session-middleware';

/**
 * Live forecasts for the catalog's Weather block. The server fetches Open-Meteo (no API key) and
 * caches each coordinate for 30 minutes; the browser never contacts a third party for weather.
 *
 * IMPORTANT: `getForecastFn`'s handler delegates to `fetchForecast`, so TanStack Start keeps
 * `fetchForecast` and the cache in the client bundle as dead code (see src/lib/artifacts.ts). This
 * module must therefore import nothing server-only: no `db`, no `env`.
 */

/** One forecast day. `date` is ISO `YYYY-MM-DD` in the location's time zone; temperatures are °C. */
export interface ForecastDay {
  date: string;
  high: number;
  low: number;
  condition: WeatherCondition;
  precipitationChance?: number;
}

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const REQUEST_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 256;

/** Maps a WMO weather interpretation code (Open-Meteo `weather_code`) onto a catalog condition. */
export function conditionFromWmoCode(code: number): WeatherCondition {
  if (code <= 1) {
    return 'clear';
  }

  if (code === 2) {
    return 'partly-cloudy';
  }

  if (code === 45 || code === 48) {
    return 'fog';
  }

  if (code >= 51 && code <= 57) {
    return 'drizzle';
  }

  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return 'rain';
  }

  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return 'snow';
  }

  if (code >= 95 && code <= 99) {
    return 'thunderstorm';
  }

  return 'cloudy';
}

const forecastResponse = z.object({
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_probability_max: z.array(z.number().nullable()),
  }),
});

/** Parses an Open-Meteo daily forecast body. Throws when the body does not match the schema. */
export function parseForecast(json: unknown): ForecastDay[] {
  const { daily } = forecastResponse.parse(json);

  return daily.time.map((date, i) => {
    const code = daily.weather_code[i];
    const high = daily.temperature_2m_max[i];
    const low = daily.temperature_2m_min[i];
    const precipitationChance = daily.precipitation_probability_max[i];

    if (
      code === undefined ||
      high === undefined ||
      low === undefined ||
      precipitationChance === undefined
    ) {
      throw new Error('Every daily series must have one entry per day.');
    }

    return {
      date,
      high,
      low,
      condition: conditionFromWmoCode(code),
      ...(precipitationChance === null ? {} : { precipitationChance }),
    };
  });
}

async function requestForecast(latitude: string, longitude: string): Promise<ForecastDay[]> {
  const url = new URL(OPEN_METEO_URL);

  url.search = new URLSearchParams({
    latitude,
    longitude,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: String(FORECAST_DAYS_MAX),
  }).toString();

  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

  if (!response.ok) {
    throw new Error(`Open-Meteo responded with status ${response.status}.`);
  }

  return parseForecast(await response.json());
}

/**
 * Keyed by the rounded `"lat,lng"`. Entries hold the promise, so concurrent callers share one
 * upstream request; a rejected promise leaves the cache so the next call retries.
 */
const cache = new Map<string, { expires: number; promise: Promise<ForecastDay[]> }>();

/**
 * The 7-day forecast in °C for a coordinate, rounded to 2 decimal places (about 1 km) for both the
 * request and the cache key.
 */
export function fetchForecast({ lat, lng }: { lat: number; lng: number }): Promise<ForecastDay[]> {
  const latitude = lat.toFixed(2);
  const longitude = lng.toFixed(2);
  const key = `${latitude},${longitude}`;
  const cached = cache.get(key);

  if (cached && cached.expires > Date.now()) {
    return cached.promise;
  }

  // Delete before set, so a refreshed key moves to the end of the insertion order.
  cache.delete(key);

  const promise = requestForecast(latitude, longitude);

  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, promise });

  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;

    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }

  promise.catch(() => {
    if (cache.get(key)?.promise === promise) {
      cache.delete(key);
    }
  });

  return promise;
}

const forecastInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const getForecastFn = createServerFn({ method: 'GET' })
  .middleware([sessionMiddleware])
  .validator(forecastInput)
  .handler(({ data }) => fetchForecast(data));
