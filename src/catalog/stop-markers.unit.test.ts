import { describe, expect, it } from 'vitest';

import { collectItineraryDays, collectStopMarkers } from '@/catalog/stop-markers';

function stop(title: string, coordinates?: { lat: number; lng: number }) {
  return { type: 'Stop', props: { title, coordinates }, children: [] };
}

describe('collectStopMarkers', () => {
  it('collects stops in document order across nested containers', () => {
    const elements = {
      a: stop('A', { lat: 1, lng: 1 }),
      card: { type: 'Card', props: {}, children: ['b'] },
      b: { type: 'Stop', props: { title: 'B', location: 'Gion', coordinates: { lat: 2, lng: 2 } } },
      c: stop('C', { lat: 3, lng: 3 }),
    };

    expect(collectStopMarkers(elements, ['a', 'card', 'c'])).toEqual([
      { id: 'a', lat: 1, lng: 1, label: 'A', description: undefined },
      { id: 'b', lat: 2, lng: 2, label: 'B', description: 'Gion' },
      { id: 'c', lat: 3, lng: 3, label: 'C', description: undefined },
    ]);
  });

  it('skips a stop without numeric coordinates', () => {
    const elements = {
      a: stop('A'),
      b: { type: 'Stop', props: { title: 'B', coordinates: { lat: '1', lng: 2 } } },
      c: { type: 'Stop', props: { coordinates: { lat: 1, lng: 2 } } },
    };

    expect(collectStopMarkers(elements, ['a', 'b', 'c'])).toEqual([
      { id: 'c', lat: 1, lng: 2, label: '', description: undefined },
    ]);
  });

  it("leaves a nested Day's stops to that Day", () => {
    const elements = {
      a: stop('A', { lat: 1, lng: 1 }),
      nested: { type: 'Day', props: { label: 'Nested' }, children: ['b'] },
      b: stop('B', { lat: 2, lng: 2 }),
    };

    expect(collectStopMarkers(elements, ['a', 'nested']).map((marker) => marker.id)).toEqual(['a']);
  });

  it('excludes a subtree whose visible condition is rejected', () => {
    const hidden = { $state: '/hidden' };
    const elements = {
      a: stop('A', { lat: 1, lng: 1 }),
      section: { type: 'Section', props: {}, visible: hidden, children: ['b'] },
      b: stop('B', { lat: 2, lng: 2 }),
    };
    const isVisible = (condition: unknown) => condition !== hidden;

    expect(
      collectStopMarkers(elements, ['a', 'section'], isVisible).map((marker) => marker.id),
    ).toEqual(['a']);
  });

  it('excludes a repeat subtree', () => {
    const elements = {
      list: { type: 'Section', props: {}, repeat: { statePath: '/stops' }, children: ['b'] },
      b: stop('B', { lat: 2, lng: 2 }),
    };

    expect(collectStopMarkers(elements, ['list'])).toEqual([]);
  });

  it('terminates on a cyclic children reference', () => {
    const elements = {
      a: { type: 'Section', props: {}, children: ['b'] },
      b: { type: 'Section', props: {}, children: ['a', 'c'] },
      c: stop('C', { lat: 3, lng: 3 }),
    };

    expect(collectStopMarkers(elements, ['a']).map((marker) => marker.id)).toEqual(['c']);
  });

  it('tolerates garbage elements and keys', () => {
    const elements = { a: null, b: 'not an element', c: stop('C', { lat: 3, lng: 3 }) };

    expect(collectStopMarkers(elements, [42, 'missing', 'a', 'b', 'c'])).toHaveLength(1);
  });
});

describe('collectItineraryDays', () => {
  it('returns each Day in document order with its own markers', () => {
    const elements = {
      'day-1': { type: 'Day', props: { label: 'Day 1' }, children: ['a', 'inner'] },
      a: stop('A', { lat: 1, lng: 1 }),
      inner: { type: 'Day', props: { label: 'Inner' }, children: ['b'] },
      b: stop('B', { lat: 2, lng: 2 }),
      wrapper: { type: 'Section', props: {}, children: ['day-2'] },
      'day-2': { type: 'Day', props: { label: 42 }, children: ['c'] },
      c: stop('C'),
    };

    expect(collectItineraryDays(elements, ['day-1', 'wrapper'])).toEqual([
      {
        key: 'day-1',
        label: 'Day 1',
        markers: [{ id: 'a', lat: 1, lng: 1, label: 'A', description: undefined }],
      },
      { key: 'day-2', label: '', markers: [] },
    ]);
  });

  it('skips a hidden Day', () => {
    const hidden = { $state: '/hidden' };
    const elements = {
      'day-1': { type: 'Day', props: { label: 'Day 1' }, visible: hidden, children: [] },
      'day-2': { type: 'Day', props: { label: 'Day 2' }, children: [] },
    };

    expect(
      collectItineraryDays(elements, ['day-1', 'day-2'], (condition) => condition !== hidden).map(
        (day) => day.key,
      ),
    ).toEqual(['day-2']);
  });

  it("leaves a nested Itinerary's days to that Itinerary", () => {
    const elements = {
      'day-1': { type: 'Day', props: { label: 'Day 1' }, children: [] },
      inner: { type: 'Itinerary', props: {}, children: ['day-2'] },
      'day-2': { type: 'Day', props: { label: 'Day 2' }, children: [] },
    };

    expect(collectItineraryDays(elements, ['day-1', 'inner']).map((day) => day.key)).toEqual([
      'day-1',
    ]);
  });

  /**
   * Validation rejects shared children, but a stored artifact or a hostile spec can still reach the
   * renderer. 500 Days listing one shared Section of 1,000 Stops cost a walk of the Section per Day.
   */
  it('expands each element once when Days share a subtree', () => {
    const days = 500;
    const stops = 1_000;
    const raw: Record<string, unknown> = {
      shared: {
        type: 'Section',
        props: {},
        children: Array.from({ length: stops }, (_, i) => `stop-${i}`),
      },
    };

    for (let i = 0; i < days; i += 1) {
      raw[`day-${i}`] = { type: 'Day', props: { label: `Day ${i}` }, children: ['shared'] };
    }

    for (let i = 0; i < stops; i += 1) {
      raw[`stop-${i}`] = stop(`Stop ${i}`, { lat: 0, lng: 0 });
    }

    let reads = 0;
    const elements = new Proxy(raw, {
      get(target, key, receiver) {
        reads += 1;

        return Reflect.get(target, key, receiver);
      },
    });

    const result = collectItineraryDays(
      elements,
      Array.from({ length: days }, (_, i) => `day-${i}`),
    );

    expect(result).toHaveLength(days);
    expect(result[0]?.markers).toHaveLength(stops);
    expect(result.slice(1).every((day) => day.markers.length === 0)).toBe(true);
    expect(reads).toBeLessThanOrEqual(days + 1 + stops);
  });
});
