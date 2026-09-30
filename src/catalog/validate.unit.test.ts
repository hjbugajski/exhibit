import { describe, expect, it } from 'vitest';

import { comparisonFixture } from '@/catalog/fixtures/comparison';
import { explainerFixture } from '@/catalog/fixtures/explainer';
import { flowFixture } from '@/catalog/fixtures/flow';
import { itineraryFixture } from '@/catalog/fixtures/itinerary';
import { kitchenSinkFixture } from '@/catalog/fixtures/kitchen-sink';
import { findStatePathConflicts, validateArtifactSpec } from '@/catalog/validate';
import { invalidFixture } from '@testing/fixtures/invalid';

import { decisionMemoExample } from '../../scripts/examples/decision-memo';
import { researchSummaryExample } from '../../scripts/examples/research-summary';
import { roadTripExample } from '../../scripts/examples/road-trip';
import { statusReportExample } from '../../scripts/examples/status-report';
import { yosemiteWeekendExample } from '../../scripts/examples/yosemite-weekend';

describe('validateArtifactSpec', () => {
  it.each([
    ['itinerary', itineraryFixture],
    ['explainer', explainerFixture],
    ['comparison', comparisonFixture],
    ['kitchen-sink', kitchenSinkFixture],
    ['flow', flowFixture],
    ['decision-memo example', decisionMemoExample.spec],
    ['research-summary example', researchSummaryExample.spec],
    ['road-trip example', roadTripExample.spec],
    ['status-report example', statusReportExample.spec],
    ['yosemite-weekend example', yosemiteWeekendExample.spec],
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

describe('findStatePathConflicts', () => {
  it('reports exact duplicates first, then prefix pairs in first-use order', () => {
    const conflicts = findStatePathConflicts([
      { key: 'a', path: '/x/y' },
      { key: 'b', path: '/x' },
      { key: 'c', path: '/x/y' },
      { key: 'd', path: '/feedback/backup' },
      { key: 'e', path: '/feedback/backup-decision' },
      { key: 'f', path: '/x/y/z' },
      { key: 'g', path: '/feedback' },
    ]);

    expect(conflicts.map(({ paths, keys }) => ({ paths, keys }))).toEqual([
      { paths: ['/x/y'], keys: ['a', 'c'] },
      { paths: ['/x', '/x/y'], keys: ['b', 'a'] },
      { paths: ['/x/y', '/x/y/z'], keys: ['a', 'f'] },
      { paths: ['/x', '/x/y/z'], keys: ['b', 'f'] },
      { paths: ['/feedback', '/feedback/backup'], keys: ['g', 'd'] },
      { paths: ['/feedback', '/feedback/backup-decision'], keys: ['g', 'e'] },
    ]);
    expect(conflicts[0]?.message).toBe(
      'statePath "/x/y" is used by 2 elements (a, c). They share one saved state. Give each interactive element a unique statePath.',
    );
    expect(conflicts[1]?.message).toBe(
      'statePath "/x" (b) contains "/x/y" (a). A write to "/x" replaces the value at "/x/y". Give each interactive element a statePath that is not a prefix of another.',
    );
  });

  /** About 25,000 paths fit in the 1 MB body cap; a pairwise comparison of 20,000 took 20 s. */
  it('checks 20,000 distinct paths in work linear in the path count', () => {
    let pathReads = 0;
    const entries = Array.from({ length: 20_000 }, (_, i) => {
      const path = `/section-${i % 100}/item-${i}/answer`;

      return {
        key: `element-${i}`,
        get path() {
          pathReads += 1;

          return path;
        },
      };
    });

    const started = performance.now();
    const conflicts = findStatePathConflicts(entries);
    const elapsed = performance.now() - started;

    expect(conflicts).toEqual([]);
    expect(pathReads).toBeLessThanOrEqual(4 * entries.length);
    expect(elapsed).toBeLessThan(500);
  });
});

describe('validateArtifactSpec element tree', () => {
  function errorsOf(spec: unknown) {
    const result = validateArtifactSpec(spec);

    return result.valid ? [] : result.errors;
  }

  const divider = { type: 'Divider' };

  it('rejects an element listed in the children of two parents', () => {
    const errors = errorsOf({
      root: 'root',
      elements: {
        root: { type: 'Section', props: {}, children: ['a', 'b'] },
        a: { type: 'Section', props: {}, children: ['shared'] },
        b: { type: 'Section', props: {}, children: ['shared'] },
        shared: divider,
      },
    });

    expect(errors).toContainEqual({
      element: 'b',
      component: 'Section',
      path: 'elements.b.children.0',
      message:
        'Element "shared" is a child of both "a" and "b". Each element has at most one parent.',
    });
  });

  it('rejects an element listed twice in one children list', () => {
    const errors = errorsOf({
      root: 'root',
      elements: {
        root: { type: 'Section', props: {}, children: ['a', 'a'] },
        a: divider,
      },
    });

    expect(errors).toContainEqual({
      element: 'root',
      component: 'Section',
      path: 'elements.root.children.1',
      message: 'Element "a" is listed more than once in the children of "root".',
    });
  });

  it('rejects an element that contains itself', () => {
    const errors = errorsOf({
      root: 'root',
      elements: {
        root: { type: 'Section', props: {}, children: ['a'] },
        a: { type: 'Section', props: {}, children: ['root'] },
      },
    });

    expect(errors).toContainEqual({
      element: 'root',
      component: 'Section',
      path: 'elements.root.children.0',
      message: 'Element "a" is its own descendant through the children of "root".',
    });
  });

  it('rejects an element that lists itself as a child', () => {
    const errors = errorsOf({
      root: 'root',
      elements: { root: { type: 'Section', props: {}, children: ['root'] } },
    });

    expect(errors).toContainEqual({
      element: 'root',
      component: 'Section',
      path: 'elements.root.children.0',
      message: 'Element "root" is its own descendant through the children of "root".',
    });
  });

  /**
   * The reviewer's shape: 200 Itineraries share one Section of 500 Days, and every Day lists one
   * shared Section of 1,000 Stops. A walk per Itinerary and per Day visited 10^8 elements (5 s).
   */
  it('validates a shared-subtree spec in work linear in its size', () => {
    const itineraries = 200;
    const days = 500;
    const stops = 1_000;
    const raw: Record<string, unknown> = {
      root: {
        type: 'Section',
        props: {},
        children: Array.from({ length: itineraries }, (_, i) => `trip-${i}`),
      },
      days: {
        type: 'Section',
        props: {},
        children: Array.from({ length: days }, (_, i) => `day-${i}`),
      },
      shared: {
        type: 'Section',
        props: {},
        children: Array.from({ length: stops }, (_, i) => `stop-${i}`),
      },
    };

    for (let i = 0; i < itineraries; i += 1) {
      raw[`trip-${i}`] = { type: 'Itinerary', props: {}, children: ['days'] };
    }

    for (let i = 0; i < days; i += 1) {
      raw[`day-${i}`] = { type: 'Day', props: { label: `Day ${i}` }, children: ['shared'] };
    }

    for (let i = 0; i < stops; i += 1) {
      raw[`stop-${i}`] = {
        type: 'Stop',
        props: { title: `Stop ${i}`, coordinates: { lat: 0, lng: 0 } },
      };
    }

    const size = Object.keys(raw).length + itineraries + itineraries + days + days + stops;
    let reads = 0;
    const elements = new Proxy(raw, {
      get(target, key, receiver) {
        reads += 1;

        return Reflect.get(target, key, receiver);
      },
    });

    const started = performance.now();
    const errors = errorsOf({ root: 'root', elements });
    const elapsed = performance.now() - started;

    expect(errors).toContainEqual(
      expect.objectContaining({
        path: 'elements.trip-1.children.0',
        message:
          'Element "days" is a child of both "trip-0" and "trip-1". Each element has at most one parent.',
      }),
    );
    expect(errors).not.toContainEqual(
      expect.objectContaining({ component: 'Itinerary', path: 'elements.trip-0.children' }),
    );
    expect(reads).toBeLessThan(20 * size);
    expect(elapsed).toBeLessThan(500);
  });

  /** Each Itinerary's walk used to descend through every Itinerary nested in it. */
  it('validates nested Itineraries in work linear in their size', () => {
    const depth = 60;
    const leaves = Array.from({ length: 20_000 }, (_, i) => `divider-${i}`);
    const raw: Record<string, unknown> = Object.fromEntries(
      leaves.map((key) => [key, { type: 'Divider' }]),
    );

    for (let i = 0; i < depth; i += 1) {
      raw[`trip-${i}`] = {
        type: 'Itinerary',
        props: {},
        children: i + 1 < depth ? [`trip-${i + 1}`] : leaves,
      };
    }

    let reads = 0;
    const elements = new Proxy(raw, {
      get(target, key, receiver) {
        reads += 1;

        return Reflect.get(target, key, receiver);
      },
    });

    expect(errorsOf({ root: 'trip-0', elements })).toEqual([]);
    expect(reads).toBeLessThan(40 * (depth + leaves.length));
  });
});

describe('validateArtifactSpec live Weather cap', () => {
  /** A Section of `live` live Weather blocks and one static one. */
  function weatherSpec(live: number) {
    const elements: Record<string, unknown> = {
      static: {
        type: 'Weather',
        props: {
          source: 'static',
          unit: 'c',
          days: [{ date: 'Mon', high: 20, low: 10, condition: 'clear' }],
        },
      },
    };

    for (let i = 0; i < live; i += 1) {
      elements[`live-${i}`] = {
        type: 'Weather',
        props: { source: 'live', location: { lat: i, lng: i } },
      };
    }

    return {
      root: 'root',
      elements: {
        root: { type: 'Section', props: {}, children: Object.keys(elements) },
        ...elements,
      },
    };
  }

  it('accepts 20 live Weather blocks', () => {
    const result = validateArtifactSpec(weatherSpec(20));

    expect(result.valid ? [] : result.errors).toEqual([]);
  });

  it('rejects a 21st live Weather block', () => {
    const result = validateArtifactSpec(weatherSpec(21));

    expect(result.valid ? [] : result.errors).toEqual([
      {
        element: null,
        component: 'Weather',
        path: 'source',
        message:
          '21 Weather blocks use source "live", and an artifact holds at most 20. Each live block fetches a forecast every time the artifact is viewed.',
      },
    ]);
  });
});

describe('validateArtifactSpec nesting depth', () => {
  /** A chain of `depth` Sections, `section-0` outermost, linked through `link`. */
  function chain(depth: number, link: 'children' | 'slots' = 'children') {
    const elements: Record<string, unknown> = {};

    for (let i = 0; i < depth; i += 1) {
      const next = i + 1 < depth ? [`section-${i + 1}`] : [];
      elements[`section-${i}`] = {
        type: 'Section',
        props: {},
        ...(link === 'children' ? { children: next } : { slots: { default: next } }),
      };
    }

    return { root: 'section-0', elements };
  }

  function errorsOf(spec: unknown) {
    const result = validateArtifactSpec(spec);

    return result.valid ? [] : result.errors;
  }

  it('accepts a spec nested 64 levels deep', () => {
    expect(errorsOf(chain(64))).toEqual([]);
  });

  it('rejects a spec nested 65 levels deep at its deepest element', () => {
    expect(errorsOf(chain(65))).toEqual([
      {
        element: 'section-64',
        component: 'Section',
        path: 'elements.section-64',
        message: 'Element "section-64" is nested 65 levels deep; a spec nests at most 64 levels.',
      },
    ]);
  });

  /** The recursive structural validator in @json-render/core overflowed the stack at this depth. */
  it('returns an error for a 5,000-deep chain instead of throwing', () => {
    let result: ReturnType<typeof validateArtifactSpec> | undefined;

    expect(() => {
      result = validateArtifactSpec(chain(5_000));
    }).not.toThrow();
    expect(result?.valid ? [] : result?.errors).toContainEqual(
      expect.objectContaining({
        path: 'elements.section-4999',
        message: expect.stringContaining('nested 5000 levels deep'),
      }),
    );
  });

  it('counts slot references as nesting', () => {
    let result: ReturnType<typeof validateArtifactSpec> | undefined;

    expect(() => {
      result = validateArtifactSpec(chain(5_000, 'slots'));
    }).not.toThrow();
    expect(result?.valid ? [] : result?.errors).toContainEqual(
      expect.objectContaining({ path: 'elements.section-4999' }),
    );
  });

  it('accepts a wide, shallow spec', () => {
    const leaves = Array.from({ length: 20_000 }, (_, i) => `divider-${i}`);

    expect(
      errorsOf({
        root: 'root',
        elements: {
          root: { type: 'Section', props: {}, children: leaves },
          ...Object.fromEntries(leaves.map((key) => [key, { type: 'Divider' }])),
        },
      }),
    ).toEqual([]);
  });

  it('returns a result for props nested 100,000 levels deep instead of throwing', () => {
    let nested: unknown = { statePath: '/deep' };

    for (let i = 0; i < 100_000; i += 1) {
      nested = { nested };
    }

    expect(() =>
      validateArtifactSpec({
        root: 'root',
        elements: { root: { type: 'Section', props: { nested } } },
      }),
    ).not.toThrow();
  });
});
