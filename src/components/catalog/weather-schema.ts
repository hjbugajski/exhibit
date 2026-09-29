/**
 * The constants the catalog's Weather block is defined by, in a module free of React and of anything
 * server-only: `src/catalog` validates against them and `src/lib/weather.ts` maps live data onto
 * them, so the schema and the forecast fetch can never disagree.
 */

/** Every condition a forecast day can carry. `windy` is for static authoring only. */
export const weatherConditions = [
  'clear',
  'partly-cloudy',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'snow',
  'thunderstorm',
  'windy',
] as const;

export type WeatherCondition = (typeof weatherConditions)[number];

/** The most days one Weather block shows, and the number of days the live fetch requests. */
export const FORECAST_DAYS_MAX = 7;
