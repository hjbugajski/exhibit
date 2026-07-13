/**
 * Deliberately invalid: a bad prop type (Table.columns should be an array), an unknown component
 * name, and a dangling child reference. Untyped as `Spec` on purpose — that's the point of this
 * fixture.
 */
export const invalidFixture: unknown = {
  root: 'root',
  elements: {
    root: {
      type: 'Section',
      props: { title: 'Broken' },
      children: ['table-bad', 'unknown-el', 'dangling-ref'],
    },
    'table-bad': {
      type: 'Table',
      props: { columns: 'not-an-array', rows: [] },
      children: [],
    },
    'unknown-el': {
      type: 'NotAComponent',
      props: {},
      children: [],
    },
    'dangling-ref': {
      type: 'Prose',
      props: { markdown: 'hi' },
      children: ['does-not-exist'],
    },
  },
};
