import type { Spec } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';

// Covers Itinerary + Day + Stop together, and all five Stop kinds across the two days. Day 1's
// stops carry coordinates, so that day auto-renders a map; day 2 has none and stays map-free.
const spec: Spec = {
  root: 'itinerary',
  elements: {
    itinerary: {
      type: 'Itinerary',
      props: { title: 'Kyoto in Two Days', dateRange: 'May 3 – May 4, 2026' },
      children: ['day-1', 'day-2'],
    },
    'day-1': {
      type: 'Day',
      props: {
        label: 'Day 1 — Saturday',
        date: 'May 3, 2026',
        summary: 'Eastern Kyoto temples and a night in Gion.',
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
        coordinates: { lat: 34.9671, lng: 135.7727 },
        markdown: 'Arrive early to beat the crowds on the torii gate trail.',
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
        coordinates: { lat: 35.0037, lng: 135.778 },
        markdown: 'Udon noodles with seasonal vegetables; no reservation needed.',
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
        coordinates: { lat: 35.0031, lng: 135.7726 },
        kind: 'lodging',
      },
      children: [],
    },
    'day-2': {
      type: 'Day',
      props: {
        label: 'Day 2 — Sunday',
        date: 'May 4, 2026',
        summary: 'Northwest Kyoto, then Osaka.',
      },
      children: ['stop-2a', 'stop-2b'],
    },
    'stop-2a': {
      type: 'Stop',
      props: {
        time: '10:30 AM',
        duration: '3 hours',
        title: 'Train to Osaka',
        location: 'Kyoto Station',
        markdown: 'Take the JR Special Rapid; tickets are available at any station kiosk.',
        kind: 'travel',
      },
      children: [],
    },
    'stop-2b': {
      type: 'Stop',
      props: {
        time: '4:00 PM',
        title: 'Coin locker pickup',
        markdown: 'Grab the bags left at the station locker before heading to the hotel.',
        kind: 'other',
      },
      children: [],
    },
  },
};

function CatalogItineraryDemo() {
  return <Playground controls={{}} layout="block" render={() => <SpecView spec={spec} />} />;
}

export const catalogItineraryDemo: LibraryDemo = {
  slug: 'catalog-itinerary',
  title: 'Itinerary',
  description:
    'Itinerary, Day, and Stop together: a multi-day trip container of days, each a list of stops. Days whose stops have coordinates auto-render a map.',
  group: 'Catalog',
  render: () => <CatalogItineraryDemo />,
};
