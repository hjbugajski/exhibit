import { describe, expect, it } from 'vitest';

import { countAnswers } from '@/lib/answer-count';

/** Three statePaths across three elements: a Checklist pair and a Rating. */
const specBody = JSON.stringify({
  root: 'root',
  elements: {
    root: { type: 'Section', props: { title: 'Sign-off' }, children: ['prep', 'confidence'] },
    prep: {
      type: 'Checklist',
      props: {
        items: [
          { id: 'size', text: 'Checked the volume size', statePath: '/prep/size' },
          { id: 'cost', text: 'Compared storage cost', statePath: '/prep/cost' },
        ],
      },
      children: [],
    },
    confidence: {
      type: 'Rating',
      props: { label: 'Confidence in the pick', statePath: '/ratings/backup' },
      children: [],
    },
  },
});

describe('countAnswers', () => {
  it('counts a spec’s statePaths and the answered subset', () => {
    expect(
      countAnswers('spec', specBody, { prep: { size: true }, ratings: { backup: 4 } }),
    ).toEqual({ answered: 2, total: 3 });
  });

  it('counts nothing answered without state', () => {
    expect(countAnswers('spec', specBody, null)).toEqual({ answered: 0, total: 3 });
  });

  it('returns zeroes for an unparseable spec', () => {
    expect(countAnswers('spec', '{ not json', null)).toEqual({ answered: 0, total: 0 });
  });

  it('dedupes a statePath used by two elements', () => {
    const body = JSON.stringify({
      root: 'root',
      elements: {
        root: { type: 'Section', props: {}, children: ['a', 'b'] },
        a: { type: 'Rating', props: { label: 'One', statePath: '/shared' }, children: [] },
        b: { type: 'Rating', props: { label: 'Two', statePath: '/shared' }, children: [] },
      },
    });

    expect(countAnswers('spec', body, { shared: 3 })).toEqual({ answered: 1, total: 1 });
  });

  it('treats false and 0 as answers, and null/empty string/missing as unanswered', () => {
    const body = JSON.stringify({
      root: 'root',
      elements: {
        root: { type: 'Section', props: {}, children: [] },
        a: { type: 'Rating', props: { label: 'a', statePath: '/a' }, children: [] },
        b: { type: 'Rating', props: { label: 'b', statePath: '/b' }, children: [] },
        c: { type: 'NoteBox', props: { label: 'c', statePath: '/c' }, children: [] },
        d: { type: 'Rating', props: { label: 'd', statePath: '/d' }, children: [] },
        e: { type: 'Rating', props: { label: 'e', statePath: '/e' }, children: [] },
      },
    });

    expect(countAnswers('spec', body, { a: false, b: 0, c: '', d: null })).toEqual({
      answered: 2,
      total: 5,
    });
  });

  it('counts an exhibit fence and a comment directive in markdown', () => {
    const body = [
      '# Sign-off',
      '',
      '```exhibit',
      JSON.stringify({
        type: 'Checklist',
        props: {
          items: [
            { id: 'size', text: 'Size', statePath: '/prep/size' },
            { id: 'cost', text: 'Cost', statePath: '/prep/cost' },
          ],
        },
      }),
      '```',
      '',
      '<!-- ::Rating label="Confidence" statePath="/ratings/backup" -->',
    ].join('\n');

    expect(countAnswers('markdown', body, null)).toEqual({ answered: 0, total: 3 });
    expect(
      countAnswers('markdown', body, { prep: { cost: true }, ratings: { backup: 5 } }),
    ).toEqual({ answered: 2, total: 3 });
  });

  it('counts a directive nested inside a wrapping directive', () => {
    const body = [
      '<!-- ::start:Card title="Feedback" -->',
      '',
      '<!-- ::NoteBox label="Notes" statePath="/notes" -->',
      '',
      '<!-- ::end:Card -->',
    ].join('\n');

    expect(countAnswers('markdown', body, { notes: 'looks good' })).toEqual({
      answered: 1,
      total: 1,
    });
  });

  it('ignores an exhibit fence whose JSON does not parse', () => {
    const body = ['```exhibit', '{ "type": "Rating", statePath: /oops', '```'].join('\n');

    expect(countAnswers('markdown', body, null)).toEqual({ answered: 0, total: 0 });
  });

  it('ignores statePath text in prose and in a non-exhibit fence', () => {
    const body = [
      'Every Rating needs a statePath like /ratings/backup.',
      '',
      '```json',
      JSON.stringify({ type: 'Rating', props: { statePath: '/ratings/backup' } }),
      '```',
    ].join('\n');

    expect(countAnswers('markdown', body, null)).toEqual({ answered: 0, total: 0 });
  });

  it('never counts anything for an html body', () => {
    const body = '<p data-state-path="/x">{"statePath":"/y"}</p>';

    expect(countAnswers('html', body, { y: 'answered' })).toEqual({ answered: 0, total: 0 });
  });
});
