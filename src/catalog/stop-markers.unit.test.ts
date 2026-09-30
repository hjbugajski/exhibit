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
});
