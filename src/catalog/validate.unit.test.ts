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
          "message": "Invalid option: expected one of "Section"|"Grid"|"Columns"|"Tabs"|"Divider"|"Heading"|"Prose"|"Callout"|"Quote"|"CodeBlock"|"Card"|"Table"|"KeyValueList"|"Steps"|"Timeline"|"Checklist"|"Details"|"Badge"|"Figure"|"Progress"|"Chart"|"Map"|"Choice"|"NoteBox"|"Rating"|"Itinerary"|"Day"|"Stop"",
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
});
