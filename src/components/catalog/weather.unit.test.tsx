// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ForecastDay } from '@/lib/weather';

vi.mock('@/lib/weather', () => ({
  getForecastFn: vi.fn(),
}));

const { getForecastFn } = await import('@/lib/weather');
const { Weather } = await import('@/components/catalog/weather');

/** Resolves once the live strip has left its loading state. */
async function settled(): Promise<HTMLElement[]> {
  await waitFor(() => expect(screen.getByRole('list').getAttribute('aria-busy')).toBeNull());

  return screen.getAllByRole('listitem');
}

const forecast: ForecastDay[] = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-10-0${i + 1}`,
  high: 20,
  low: 10,
  condition: 'clear',
  precipitationChance: 30,
}));

afterEach(() => {
  cleanup();
});

describe('Weather (static)', () => {
  it('renders one tile per day with the label, temperatures, and precipitation', () => {
    render(
      <Weather
        props={{
          source: 'static',
          unit: 'c',
          label: 'Kyoto',
          days: [
            { date: 'Mon', high: 24.4, low: 15.6, condition: 'rain', precipitationChance: 60 },
            { date: 'Tue', high: 22, low: -0.4, condition: 'partly-cloudy' },
          ],
        }}
      />,
    );

    const list = screen.getByRole('list', { name: 'Kyoto' });
    const [monday, tuesday] = within(list).getAllByRole('listitem');

    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(monday?.textContent).toContain('Mon');
    expect(monday?.textContent).toContain('Rain');
    expect(monday?.textContent).toContain('24°C');
    expect(monday?.textContent).toContain('16°C');
    expect(monday?.textContent).toContain('60%');
    expect(tuesday?.textContent).toContain('Partly cloudy');
    expect(tuesday?.textContent).toContain('0°C');
    expect(tuesday?.textContent).not.toContain('-0');
    expect(tuesday?.textContent).not.toContain('%');
  });

  it('formats Fahrenheit when unit is f', () => {
    render(
      <Weather
        props={{
          source: 'static',
          unit: 'f',
          days: [{ date: 'Mon', high: 75, low: 60, condition: 'clear' }],
        }}
      />,
    );

    const tile = screen.getByRole('listitem');

    expect(tile.textContent).toContain('75°');
    expect(tile.textContent).not.toContain('°C');
  });
});

describe('Weather (live)', () => {
  it('shows dayCount skeleton tiles under aria-busy while the forecast loads', async () => {
    vi.mocked(getForecastFn).mockReturnValue(new Promise(() => {}));

    render(
      <Weather props={{ source: 'live', location: { lat: 35.01, lng: 135.77 }, dayCount: 3 }} />,
    );

    const list = screen.getByRole('list', { name: 'Weather forecast' });

    expect(list.getAttribute('aria-busy')).toBe('true');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    await waitFor(() =>
      expect(getForecastFn).toHaveBeenCalledWith({ data: { lat: 35.01, lng: 135.77 } }),
    );
  });

  it('renders the fetched days sliced to dayCount, converted to Fahrenheit', async () => {
    vi.mocked(getForecastFn).mockResolvedValue(forecast);

    render(
      <Weather props={{ source: 'live', location: { lat: 1, lng: 2 }, dayCount: 4, unit: 'f' }} />,
    );

    const tiles = await settled();

    expect(tiles).toHaveLength(4);
    expect(tiles[0]?.textContent).toContain('68°');
    expect(tiles[0]?.textContent).toContain('50°');
    expect(tiles[0]?.querySelector('time')?.getAttribute('dateTime')).toBe('2026-10-01');
    expect(screen.getByRole('link', { name: 'Open-Meteo' }).getAttribute('href')).toBe(
      'https://open-meteo.com',
    );
  });

  it('defaults to 5 days in Celsius', async () => {
    vi.mocked(getForecastFn).mockResolvedValue(forecast);

    render(<Weather props={{ source: 'live', location: { lat: 1, lng: 2 } }} />);

    const tiles = await settled();

    expect(tiles).toHaveLength(5);
    expect(tiles[0]?.textContent).toContain('20°C');
  });

  it('shows the unavailable message when the fetch fails', async () => {
    vi.mocked(getForecastFn).mockRejectedValue(new Error('Unauthorized'));

    render(<Weather props={{ source: 'live', location: { lat: 1, lng: 2 } }} />);

    expect(await screen.findByText(/Forecast unavailable/)).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
