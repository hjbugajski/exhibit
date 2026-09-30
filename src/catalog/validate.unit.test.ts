import { describe, expect, it } from 'vitest';

import { comparisonFixture } from '@/catalog/fixtures/comparison';
import { explainerFixture } from '@/catalog/fixtures/explainer';
import { flowFixture } from '@/catalog/fixtures/flow';
import { itineraryFixture } from '@/catalog/fixtures/itinerary';
import { kitchenSinkFixture } from '@/catalog/fixtures/kitchen-sink';
import { validateArtifactSpec } from '@/catalog/validate';
import { invalidFixture } from '@testing/fixtures/invalid';

describe('validateArtifactSpec', () => {
  it.each([
    ['itinerary', itineraryFixture],
    ['explainer', explainerFixture],
    ['comparison', comparisonFixture],
    ['kitchen-sink', kitchenSinkFixture],
    ['flow', flowFixture],
  ])('accepts the %s fixture', (_name, fixture) => {
    const result = validateArtifactSpec(fixture);

    expect(result.valid).toBe(true);
  });

  it('produces the documented error shape for the invalid fixture', () => {
    const result = validateArtifactSpec(invalidFixture);

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toMatchInlineSnapshot(`
      [
        {
          "component": "NotAComponent",
          "element": "unknown-el",
          "message": "Invalid option: expected one of "Section"|"Grid"|"Columns"|"Tabs"|"Divider"|"Heading"|"Prose"|"Callout"|"Quote"|"CodeBlock"|"Card"|"Table"|"KeyValueList"|"Steps"|"Timeline"|"Checklist"|"Details"|"Badge"|"Figure"|"Progress"|"Chart"|"Mermaid"|"Map"|"Choice"|"NoteBox"|"Rating"|"Itinerary"|"Day"|"Stop"|"Trail"|"Weather"",
          "path": "elements.unknown-el.type",
        },
        {
          "component": "Table",
          "element": "table-bad",
          "message": "Invalid input: expected array, received string",
          "path": "elements.table-bad.props.columns",
        },
        {
          "component": "Prose",
          "element": "dangling-ref",
          "message": "Element "dangling-ref" references child "does-not-exist" which does not exist in the elements map.",
          "path": "elements.dangling-ref",
        },
      ]
    `);
  });

  it.each([null, 42, 'str', {}, { root: 'x', elements: {} }])(
    'does not throw on garbage input %#',
    (garbage) => {
      expect(() => validateArtifactSpec(garbage)).not.toThrow();

      const result = validateArtifactSpec(garbage);

      expect(result.valid).toBe(false);
      if (result.valid) {
        throw new Error('expected invalid result');
      }

      expect(result.errors.length).toBeGreaterThan(0);
    },
  );

  it('rejects a spec whose Prose markdown exceeds the catalog cap', () => {
    const result = validateArtifactSpec({
      root: 'prose',
      elements: {
        prose: {
          type: 'Prose',
          props: { markdown: 'a'.repeat(100_001) },
          children: [],
        },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'prose',
        component: 'Prose',
        path: 'elements.prose.props.markdown',
      }),
    );
  });

  it.each([
    [
      'a live Weather without location',
      { source: 'live', unit: 'c' },
      'elements.weather.props.location',
    ],
    [
      'a Weather with an unknown source',
      { source: 'hourly', location: { lat: 0, lng: 0 } },
      'elements.weather.props.source',
    ],
    [
      'a static Weather with a repeated date',
      {
        source: 'static',
        unit: 'c',
        days: [
          { date: 'Mon', high: 20, low: 10, condition: 'clear' },
          { date: 'Mon', high: 21, low: 11, condition: 'rain' },
        ],
      },
      'elements.weather.props.days',
    ],
  ])('rejects %s at the offending field', (_name, props, path) => {
    const result = validateArtifactSpec({
      root: 'weather',
      elements: { weather: { type: 'Weather', props, children: [] } },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({ element: 'weather', component: 'Weather', path }),
    );
  });

  it('rejects Stop coordinates outside valid ranges', () => {
    const result = validateArtifactSpec({
      root: 'stop',
      elements: {
        stop: {
          type: 'Stop',
          props: { title: 'Nowhere', coordinates: { lat: 91, lng: 0 } },
          children: [],
        },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'stop',
        component: 'Stop',
        path: 'elements.stop.props.coordinates.lat',
      }),
    );
  });

  it('rejects a Day whose coordinate-bearing stops exceed the auto-map marker cap', () => {
    const stops = Object.fromEntries(
      Array.from({ length: 501 }, (_, i) => [
        `stop-${i}`,
        {
          type: 'Stop',
          props: { title: `Stop ${i}`, coordinates: { lat: 0, lng: 0 } },
          children: [],
        },
      ]),
    );
    const result = validateArtifactSpec({
      root: 'day',
      elements: {
        day: { type: 'Day', props: { label: 'Day 1' }, children: Object.keys(stops) },
        ...stops,
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'day',
        component: 'Day',
        path: 'elements.day.children',
        message: expect.stringContaining('at most 500'),
      }),
    );
  });

  /** Two Days of coordinate Stops, each under the per-Day cap, totalling `total`. */
  function tripOf(total: number) {
    const firstDay = Math.ceil(total / 2);
    const stops = Object.fromEntries(
      Array.from({ length: total }, (_, i) => [
        `stop-${i}`,
        {
          type: 'Stop',
          props: { title: `Stop ${i}`, coordinates: { lat: 0, lng: 0 } },
          children: [],
        },
      ]),
    );
    const keys = Object.keys(stops);

    return validateArtifactSpec({
      root: 'trip',
      elements: {
        trip: { type: 'Itinerary', props: {}, children: ['day-1', 'day-2'] },
        'day-1': { type: 'Day', props: { label: 'Day 1' }, children: keys.slice(0, firstDay) },
        'day-2': { type: 'Day', props: { label: 'Day 2' }, children: keys.slice(firstDay) },
        ...stops,
      },
    });
  }

  it('rejects an Itinerary whose days together exceed the trip map marker cap', () => {
    const result = tripOf(501);

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toEqual([
      expect.objectContaining({
        element: 'trip',
        component: 'Itinerary',
        path: 'elements.trip.children',
        message: expect.stringContaining('at most 500'),
      }),
    ]);
  });

  it('accepts an Itinerary whose days together reach the trip map marker cap', () => {
    const result = tripOf(500);

    expect(result.valid ? [] : result.errors).toEqual([]);
  });

  it('rejects a Stop with a non-http(s) url', () => {
    const result = validateArtifactSpec({
      root: 'stop',
      elements: {
        stop: { type: 'Stop', props: { title: 'Omen', url: 'ftp://x' }, children: [] },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({ element: 'stop', path: 'elements.stop.props.url' }),
    );
  });

  it('rejects a Table link cell with a non-http(s) href', () => {
    const result = validateArtifactSpec({
      root: 'table',
      elements: {
        table: {
          type: 'Table',
          props: {
            columns: [{ key: 'a', label: 'A' }],
            rows: [{ a: { text: 'click', href: 'javascript:alert(1)' } }],
          },
          children: [],
        },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({ element: 'table', component: 'Table' }),
    );
  });

  it('flags two elements writing to the same statePath', () => {
    const result = validateArtifactSpec({
      root: 'root',
      elements: {
        root: { type: 'Section', props: {}, children: ['rating', 'choice'] },
        rating: {
          type: 'Rating',
          props: { label: 'Draft 1', statePath: '/ratings/shared' },
          children: [],
        },
        choice: {
          type: 'Choice',
          props: {
            label: 'Pick one',
            options: [
              { id: 'a', label: 'A' },
              { id: 'b', label: 'B' },
            ],
            statePath: '/ratings/shared',
          },
          children: [],
        },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        path: 'statePath',
        message: expect.stringContaining('/ratings/shared'),
      }),
    );
  });

  it('flags duplicate labels within one Tabs element', () => {
    const result = validateArtifactSpec({
      root: 'tabs',
      elements: {
        tabs: {
          type: 'Tabs',
          props: { items: ['One', 'One'] },
          children: ['a', 'b'],
        },
        a: { type: 'Prose', props: { markdown: 'a' }, children: [] },
        b: { type: 'Prose', props: { markdown: 'b' }, children: [] },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'tabs',
        component: 'Tabs',
        path: 'elements.tabs.props.items',
      }),
    );
  });

  it('flags duplicate option labels within one Choice element', () => {
    const result = validateArtifactSpec({
      root: 'choice',
      elements: {
        choice: {
          type: 'Choice',
          props: {
            label: 'Pick one',
            options: [
              { id: 'yes-1', label: 'Yes' },
              { id: 'yes-2', label: 'Yes' },
            ],
            statePath: '/decisions/pick',
          },
          children: [],
        },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'choice',
        component: 'Choice',
        path: 'elements.choice.props.options',
      }),
    );
  });

  it('flags duplicate ids within one Choice element', () => {
    const result = validateArtifactSpec({
      root: 'choice',
      elements: {
        choice: {
          type: 'Choice',
          props: {
            label: 'Pick one',
            options: [
              { id: 'dup', label: 'Alpha' },
              { id: 'dup', label: 'Beta' },
            ],
            statePath: '/decisions/pick',
          },
          children: [],
        },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'choice',
        component: 'Choice',
        path: 'elements.choice.props.options',
      }),
    );
  });

  it('flags duplicate ids within one Steps element', () => {
    const result = validateArtifactSpec({
      root: 'steps',
      elements: {
        steps: {
          type: 'Steps',
          props: {
            items: [
              { id: 'dup', title: 'First' },
              { id: 'dup', title: 'Second' },
            ],
          },
          children: [],
        },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'steps',
        component: 'Steps',
        path: 'elements.steps.props.items',
      }),
    );
  });

  it('flags duplicate column keys within one Table element', () => {
    const result = validateArtifactSpec({
      root: 'table',
      elements: {
        table: {
          type: 'Table',
          props: {
            columns: [
              { key: 'name', label: 'Name' },
              { key: 'name', label: 'Duplicate' },
            ],
            rows: [],
          },
          children: [],
        },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'table',
        component: 'Table',
        path: 'elements.table.props.columns',
      }),
    );
  });

  it('flags a Tabs element whose items count does not match its children count', () => {
    const result = validateArtifactSpec({
      root: 'tabs',
      elements: {
        tabs: {
          type: 'Tabs',
          props: { items: ['One', 'Two', 'Three'] },
          children: ['a', 'b'],
        },
        a: { type: 'Prose', props: { markdown: 'a' }, children: [] },
        b: { type: 'Prose', props: { markdown: 'b' }, children: [] },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'tabs',
        component: 'Tabs',
        path: 'elements.tabs.props.items',
      }),
    );
  });

  it('rejects a Heading with empty text', () => {
    const result = validateArtifactSpec({
      root: 'heading',
      elements: {
        heading: { type: 'Heading', props: { level: 1, text: '' }, children: [] },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'heading',
        component: 'Heading',
        path: 'elements.heading.props.text',
      }),
    );
  });

  it('rejects a Badge with empty text', () => {
    const result = validateArtifactSpec({
      root: 'badge',
      elements: {
        badge: { type: 'Badge', props: { text: '' }, children: [] },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'badge',
        component: 'Badge',
        path: 'elements.badge.props.text',
      }),
    );
  });

  it('rejects a Card with delta or trend but no value', () => {
    const result = validateArtifactSpec({
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: { title: 'Revenue', delta: '+12%', trend: 'up' },
          children: [],
        },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'card',
        component: 'Card',
        path: 'elements.card.props.value',
      }),
    );
  });

  it('rejects a Chart data point with a non-finite value', () => {
    const result = validateArtifactSpec({
      root: 'chart',
      elements: {
        chart: {
          type: 'Chart',
          props: {
            kind: 'bar',
            data: [
              { label: 'A', value: 1 },
              { label: 'B', value: Infinity },
            ],
          },
          children: [],
        },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'chart',
        component: 'Chart',
        path: 'elements.chart.props.data.1.value',
      }),
    );
  });

  it('rejects a Choice option missing id', () => {
    const result = validateArtifactSpec({
      root: 'choice',
      elements: {
        choice: {
          type: 'Choice',
          props: {
            label: 'Pick one',
            options: [{ label: 'Alpha' }, { id: 'beta', label: 'Beta' }],
            statePath: '/decisions/pick',
          },
          children: [],
        },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'choice',
        component: 'Choice',
        path: 'elements.choice.props.options.0.id',
      }),
    );
  });

  it('accepts a spec whose leaf elements omit children and visible, padding children in the result', () => {
    const result = validateArtifactSpec({
      root: 'root',
      elements: {
        root: { type: 'Section', props: {}, children: ['heading', 'prose'] },
        heading: { type: 'Heading', props: { level: 1, text: 'Title' } },
        prose: { type: 'Prose', props: { markdown: 'Body copy.' } },
      },
    });

    expect(result.valid).toBe(true);
    if (!result.valid) {
      throw new Error('expected valid result');
    }

    expect(result.spec.elements.prose).toMatchObject({ children: [] });
  });

  it('accepts an element omitting props on a component with no required props, padding props in the result', () => {
    const result = validateArtifactSpec({
      root: 'root',
      elements: {
        root: { type: 'Section', children: ['divider'] },
        divider: { type: 'Divider' },
      },
    });

    expect(result.valid).toBe(true);
    if (!result.valid) {
      throw new Error('expected valid result');
    }

    // The renderer's resolveElementProps calls Object.entries(props) unguarded, so a valid result
    // must hand the render paths a props object even when the author omitted one.
    expect(result.spec.elements.divider).toMatchObject({ props: {}, children: [] });
  });

  it('still requires props a component declares when props is omitted entirely', () => {
    const result = validateArtifactSpec({
      root: 'prose',
      elements: {
        prose: { type: 'Prose' },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toEqual([
      expect.objectContaining({
        element: 'prose',
        component: 'Prose',
        path: 'elements.prose.props.markdown',
      }),
    ]);
  });

  it('still flags a dangling child reference on an element that omits props', () => {
    const result = validateArtifactSpec({
      root: 'root',
      elements: {
        root: { type: 'Section', children: ['does-not-exist'] },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        element: 'root',
        component: 'Section',
        path: 'elements.root',
        message: expect.stringContaining('does-not-exist'),
      }),
    );
  });
});

describe('validateArtifactSpec statePath overlaps', () => {
  /** A write to a parent path replaces the whole subtree, so overlapping paths erase each other. */
  it('flags a statePath that is a segment prefix of another element’s', () => {
    const result = validateArtifactSpec({
      root: 'root',
      elements: {
        root: { type: 'Section', props: {}, children: ['rating', 'note'] },
        rating: { type: 'Rating', props: { label: 'Rate', statePath: '/feedback' }, children: [] },
        note: { type: 'NoteBox', props: { label: 'Notes', statePath: '/feedback/note' } },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        path: 'statePath',
        message: expect.stringMatching(/"\/feedback".*"\/feedback\/note"/),
      }),
    );
  });

  it('accepts paths that share only a string prefix, not a segment', () => {
    const result = validateArtifactSpec({
      root: 'root',
      elements: {
        root: { type: 'Section', props: {}, children: ['a', 'b'] },
        a: { type: 'Rating', props: { label: 'A', statePath: '/feedback/backup' } },
        b: { type: 'NoteBox', props: { label: 'B', statePath: '/feedback/backup-decision' } },
      },
    });

    expect(result.valid).toBe(true);
  });

  it('flags overlapping paths within one Checklist', () => {
    const result = validateArtifactSpec({
      root: 'list',
      elements: {
        list: {
          type: 'Checklist',
          props: {
            items: [
              { id: 'a', text: 'Parent', statePath: '/a' },
              { id: 'b', text: 'Child', statePath: '/a/b' },
            ],
          },
        },
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({ element: 'list', component: 'Checklist', path: 'statePath' }),
    );
  });
});

describe('validateArtifactSpec Trail', () => {
  const trail = {
    name: 'Mount Tam loop',
    distance: { value: 8.4, unit: 'km' },
    elevationGain: { value: 650, unit: 'm' },
    difficulty: 'moderate',
    routeType: 'loop',
    duration: '4 hours',
    track: [
      { lat: 37.9, lng: -122.6 },
      { lat: 37.91, lng: -122.58 },
    ],
    waypoints: [{ id: 'trailhead', lat: 37.9, lng: -122.6, label: 'Trailhead' }],
    elevationProfile: [100, 400, 750],
    markdown: 'Bring water.',
  };

  function validate(props: Record<string, unknown>) {
    return validateArtifactSpec({
      root: 'trail',
      elements: { trail: { type: 'Trail', props, children: [] } },
    });
  }

  it('accepts a full Trail', () => {
    const result = validate(trail);

    expect(result.valid ? [] : result.errors).toEqual([]);
  });

  it.each([
    [
      'a distance in feet',
      { ...trail, distance: { value: 8.4, unit: 'ft' } },
      'elements.trail.props.distance.unit',
    ],
    [
      'a track over 500 points',
      { ...trail, track: Array.from({ length: 501 }, () => ({ lat: 37.9, lng: -122.6 })) },
      'elements.trail.props.track',
    ],
  ])('rejects %s at the offending field', (_name, props, path) => {
    const result = validate(props);

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({ element: 'trail', component: 'Trail', path }),
    );
  });

  it('rejects duplicate waypoint ids', () => {
    const result = validate({ ...trail, waypoints: [...trail.waypoints, ...trail.waypoints] });

    expect(result.valid).toBe(false);
    if (result.valid) {
      throw new Error('expected invalid result');
    }

    expect(result.errors).toContainEqual(
      expect.objectContaining({
        path: 'elements.trail.props.waypoints',
        message: 'Item id "trailhead" is used more than once; ids must be unique within the list.',
      }),
    );
  });
});
