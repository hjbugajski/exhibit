import type { Spec } from '@json-render/core';

/** Uses Table/KeyValueList/Grid/Badge: a three-plan pricing comparison. */
export const comparisonFixture: Spec = {
  root: 'root',
  elements: {
    root: { type: 'Section', props: { title: 'Plan Comparison' }, children: ['grid'] },
    grid: { type: 'Grid', props: { columns: 3 }, children: ['card-a', 'card-b', 'card-c'] },
    'card-a': { type: 'Card', props: { title: 'Starter', badge: 'Free' }, children: ['kv-a'] },
    'kv-a': {
      type: 'KeyValueList',
      props: {
        items: [
          { id: 'storage', key: 'Storage', value: '5 GB' },
          { id: 'users', key: 'Users', value: '1' },
        ],
      },
      children: [],
    },
    'card-b': {
      type: 'Card',
      props: { title: 'Pro', subtitle: 'Best value' },
      children: ['badge-b', 'table-b'],
    },
    'badge-b': { type: 'Badge', props: { text: 'Most popular', variant: 'success' }, children: [] },
    'table-b': {
      type: 'Table',
      props: {
        columns: [
          { key: 'feature', label: 'Feature' },
          { key: 'included', label: 'Included', align: 'center' },
        ],
        rows: [
          { feature: 'Storage', included: '200 GB' },
          { feature: 'Support', included: 'Priority' },
        ],
      },
      children: [],
    },
    'card-c': { type: 'Card', props: { title: 'Enterprise' }, children: ['badge-c'] },
    'badge-c': { type: 'Badge', props: { text: 'Contact us' }, children: [] },
  },
};
