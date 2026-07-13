import type { Spec } from '@json-render/core';

/**
 * Uses Itinerary/Day/Stop richly: two days, mixed stop kinds, markdown with
 * a link, and stops with/without duration.
 */
export const itineraryFixture: Spec = {
  root: 'itinerary',
  elements: {
    itinerary: {
      type: 'Itinerary',
      props: { title: 'Kyoto in Three Days', dateRange: 'May 3 – May 5, 2026' },
      children: ['day-1', 'day-2'],
    },
    'day-1': {
      type: 'Day',
      props: {
        label: 'Day 1 — Saturday',
        date: 'May 3, 2026',
        summary: 'Eastern Kyoto temples and tea.',
      },
      children: ['stop-1a', 'stop-1b', 'stop-1c'],
    },
    'stop-1a': {
      type: 'Stop',
      props: {
        time: '9:00 AM',
        duration: '2 hours',
        title: 'Fushimi Inari Shrine',
        location: 'Fushimi-ku',
        markdown:
          'Arrive early to beat the crowds on the [torii gate trail](https://www.japan-guide.com/e/e3915.html).',
        kind: 'activity',
      },
      children: [],
    },
    'stop-1b': {
      type: 'Stop',
      props: {
        time: '12:00 PM',
        duration: '1 hour',
        title: 'Lunch at Omen',
        location: 'Gion',
        markdown: 'Udon noodles with seasonal vegetables.',
        kind: 'food',
      },
      children: [],
    },
    'stop-1c': {
      type: 'Stop',
      props: {
        time: '7:00 PM',
        title: 'Check in: Kyoto Granbell Hotel',
        location: 'Gion-Shijo',
        kind: 'lodging',
      },
      children: [],
    },
    'day-2': {
      type: 'Day',
      props: { label: 'Day 2 — Sunday', date: 'May 4, 2026' },
      children: ['stop-2a', 'stop-2b'],
    },
    'stop-2a': {
      type: 'Stop',
      props: {
        time: '8:30 AM',
        title: 'Arashiyama Bamboo Grove',
        location: 'Arashiyama',
        kind: 'activity',
      },
      children: [],
    },
    'stop-2b': {
      type: 'Stop',
      props: {
        time: '3:00 PM',
        duration: '3 hours',
        title: 'Train to Osaka',
        kind: 'travel',
        markdown: 'Take the JR line; tickets are available at any station kiosk.',
      },
      children: [],
    },
  },
};
