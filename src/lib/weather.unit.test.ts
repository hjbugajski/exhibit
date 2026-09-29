import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { conditionFromWmoCode, fetchForecast, parseForecast } from '@/lib/weather';

/** A 7-day Open-Meteo daily body; day 4 has no precipitation probability. */
const fixture = {
  daily: {
    time: [
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ],
    weather_code: [0, 2, 3, 61, 71, 95, 45],
    temperature_2m_max: [24.1, 22.8, 21, 19.5, 3.2, 25.6, 18],
    temperature_2m_min: [15.2, 14, 13.9, 12.1, -1.4, 17.3, 11],
    precipitation_probability_max: [0, 10, 20, null, 80, 90, 5],
  },
};

const fetchMock = vi.fn<typeof fetch>();

function respondWith(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

function requestedUrl(call = 0): URL {
  const input = fetchMock.mock.calls[call]?.[0];

  if (!(input instanceof URL)) {
    throw new Error('expected fetch to receive a URL');
  }

  return input;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('conditionFromWmoCode', () => {
  it.each([
    [0, 'clear'],
    [1, 'clear'],
    [2, 'partly-cloudy'],
    [3, 'cloudy'],
    [45, 'fog'],
    [48, 'fog'],
    [53, 'drizzle'],
    [63, 'rain'],
    [81, 'rain'],
    [73, 'snow'],
    [86, 'snow'],
    [95, 'thunderstorm'],
    [99, 'thunderstorm'],
    [4, 'cloudy'],
  ])('maps WMO code %i to %s', (code, condition) => {
    expect(conditionFromWmoCode(code)).toBe(condition);
  });
});

describe('parseForecast', () => {
  it('parses every day and omits a null precipitation chance', () => {
    const days = parseForecast(fixture);

    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({
      date: '2026-10-01',
      high: 24.1,
      low: 15.2,
      condition: 'clear',
      precipitationChance: 0,
    });
    expect(days[3]).toEqual({ date: '2026-10-04', high: 19.5, low: 12.1, condition: 'rain' });
  });

  it('throws on a body without daily data', () => {
    expect(() => parseForecast({ hourly: {} })).toThrow();
  });

  it('throws when the daily series lengths differ', () => {
    expect(() =>
      parseForecast({ daily: { ...fixture.daily, temperature_2m_min: [1, 2] } }),
    ).toThrow();
  });
});

describe('fetchForecast', () => {
  it('requests rounded coordinates, the local time zone, and 7 days with a timeout signal', async () => {
    respondWith(fixture);

    await fetchForecast({ lat: 35.011_636, lng: 135.768_029 });

    const url = requestedUrl();

    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe('35.01');
    expect(url.searchParams.get('longitude')).toBe('135.77');
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(url.searchParams.get('forecast_days')).toBe('7');
    expect(url.searchParams.get('daily')).toBe(
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects a malformed body', async () => {
    respondWith({ error: true, reason: 'nope' });

    await expect(fetchForecast({ lat: 1, lng: 1 })).rejects.toThrow();
  });

  it('rejects a non-OK status', async () => {
    respondWith({ error: true }, 503);

    await expect(fetchForecast({ lat: 2, lng: 2 })).rejects.toThrow('503');
  });

  it('serves a repeat call from cache for 30 minutes, then refetches', async () => {
    vi.useFakeTimers();
    respondWith(fixture);
    respondWith(fixture);

    await fetchForecast({ lat: 3, lng: 3 });
    vi.advanceTimersByTime(29 * 60 * 1000);
    await fetchForecast({ lat: 3.001, lng: 3.001 });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2 * 60 * 1000);
    await fetchForecast({ lat: 3, lng: 3 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one upstream request between concurrent callers', async () => {
    respondWith(fixture);

    const [first, second] = await Promise.all([
      fetchForecast({ lat: 4, lng: 4 }),
      fetchForecast({ lat: 4, lng: 4 }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('does not cache a failed fetch', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'));
    respondWith(fixture);

    await expect(fetchForecast({ lat: 5, lng: 5 })).rejects.toThrow('network down');
    await expect(fetchForecast({ lat: 5, lng: 5 })).resolves.toHaveLength(7);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
