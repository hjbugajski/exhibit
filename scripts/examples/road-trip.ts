import type { Spec } from '@json-render/core';

/**
 * Uses Map with multiple markers and a route path, plus Itinerary/Day/Stop for a road trip —
 * distinct from the Kyoto walking itinerary: driving legs, a longer route, and a real dashed-path
 * detour.
 */
const spec: Spec = {
  root: 'root',
  elements: {
    root: {
      type: 'Section',
      props: {
        title: 'Pacific Coast Highway: SF to San Diego',
        subtitle: 'Sept 11 – Sept 14, 2026',
      },
      children: ['route-map', 'facts', 'itinerary', 'closure-note', 'photo'],
    },
    itinerary: {
      type: 'Itinerary',
      props: {},
      children: ['day-1', 'day-2', 'day-3', 'day-4'],
    },
    'route-map': {
      type: 'Map',
      props: {
        markers: [
          {
            id: 'sf',
            lat: 37.7749,
            lng: -122.4194,
            label: 'San Francisco',
            description: 'Start — pick up the rental at 8 AM.',
          },
          {
            id: 'big-sur',
            lat: 36.2704,
            lng: -121.8081,
            label: 'Big Sur',
            description: 'Overnight; McWay Falls trailhead is 5 min from the lodge.',
          },
          {
            id: 'santa-barbara',
            lat: 34.4208,
            lng: -119.6982,
            label: 'Santa Barbara',
            description: 'Lunch stop and beach walk.',
          },
          {
            id: 'la',
            lat: 34.0522,
            lng: -118.2437,
            label: 'Los Angeles',
            description: 'Overnight, Venice Beach.',
          },
          {
            id: 'san-diego',
            lat: 32.7157,
            lng: -117.1611,
            label: 'San Diego',
            description: 'Trip end — drop off rental at the airport.',
          },
        ],
        paths: [
          {
            id: 'main-route',
            points: [
              { lat: 37.7749, lng: -122.4194 },
              { lat: 36.2704, lng: -121.8081 },
              { lat: 34.4208, lng: -119.6982 },
              { lat: 34.0522, lng: -118.2437 },
              { lat: 32.7157, lng: -117.1611 },
            ],
          },
          {
            id: 'nacimiento-detour',
            dashed: true,
            points: [
              { lat: 36.2704, lng: -121.8081 },
              { lat: 35.9563, lng: -121.2394 },
            ],
          },
        ],
      },
      children: [],
    },
    facts: {
      type: 'KeyValueList',
      props: {
        columns: 2,
        items: [
          { id: 'distance', key: 'Total distance', value: '~510 miles' },
          { id: 'driving-time', key: 'Driving time', value: '11 hours, spread over 4 days' },
          { id: 'rental', key: 'Rental', value: 'Mid-size SUV, unlimited mileage' },
          { id: 'best-season', key: 'Best season', value: 'Apr–Oct (Hwy 1 slide risk in winter)' },
        ],
      },
      children: [],
    },
    'day-1': {
      type: 'Day',
      props: {
        label: 'Day 1 — Friday',
        date: 'Sept 11, 2026',
        summary: 'SF to Big Sur via Highway 1.',
      },
      children: ['stop-1a', 'stop-1b', 'stop-1c'],
    },
    'stop-1a': {
      type: 'Stop',
      props: {
        time: '8:00 AM',
        duration: '30 minutes',
        title: 'Pick up rental car',
        location: 'SFO',
        kind: 'other',
      },
      children: [],
    },
    'stop-1b': {
      type: 'Stop',
      props: {
        time: '11:30 AM',
        duration: '1 hour',
        title: 'Lunch in Santa Cruz',
        location: 'Santa Cruz Wharf',
        markdown:
          'Clam chowder in a bread bowl; walk the wharf before the drive south gets twisty.',
        kind: 'food',
      },
      children: [],
    },
    'stop-1c': {
      type: 'Stop',
      props: {
        time: '5:00 PM',
        title: 'Check in: Post Ranch Inn',
        location: 'Big Sur',
        markdown: 'Book the ocean-facing room — the standard-view rooms face the parking lot.',
        kind: 'lodging',
      },
      children: [],
    },
    'day-2': {
      type: 'Day',
      props: {
        label: 'Day 2 — Saturday',
        date: 'Sept 12, 2026',
        summary: 'Big Sur to Santa Barbara.',
      },
      children: ['stop-2a', 'stop-2b', 'stop-2c'],
    },
    'stop-2a': {
      type: 'Stop',
      props: {
        time: '7:30 AM',
        duration: '1 hour',
        title: 'McWay Falls',
        location: 'Julia Pfeiffer Burns State Park',
        markdown: 'Go at sunrise — the overlook parking lot fills by 9 AM in September.',
        kind: 'activity',
      },
      children: [],
    },
    'stop-2b': {
      type: 'Stop',
      props: {
        time: '10:00 AM',
        duration: '3.5 hours',
        title: 'Drive: Big Sur to Santa Barbara',
        markdown: 'Fuel up in Cambria — no gas stations for the next 40 miles south.',
        kind: 'travel',
      },
      children: [],
    },
    'stop-2c': {
      type: 'Stop',
      props: {
        time: '2:00 PM',
        duration: '3 hours',
        title: 'State Street & East Beach',
        location: 'Santa Barbara',
        kind: 'activity',
      },
      children: [],
    },
    'day-3': {
      type: 'Day',
      props: { label: 'Day 3 — Sunday', date: 'Sept 13, 2026', summary: 'Santa Barbara to LA.' },
      children: ['stop-3a', 'stop-3b'],
    },
    'stop-3a': {
      type: 'Stop',
      props: {
        time: '11:00 AM',
        duration: '2 hours',
        title: 'Drive to Los Angeles',
        kind: 'travel',
      },
      children: [],
    },
    'stop-3b': {
      type: 'Stop',
      props: {
        time: '4:00 PM',
        title: 'Check in: Venice Beach hotel',
        location: 'Venice',
        markdown: 'Sunset at the Venice canals is a 10-minute walk from the hotel.',
        kind: 'lodging',
      },
      children: [],
    },
    'day-4': {
      type: 'Day',
      props: {
        label: 'Day 4 — Monday',
        date: 'Sept 14, 2026',
        summary: 'LA to San Diego, trip end.',
      },
      children: ['stop-4a', 'stop-4b'],
    },
    'stop-4a': {
      type: 'Stop',
      props: {
        time: '10:00 AM',
        duration: '2.5 hours',
        title: 'Drive: LA to San Diego',
        markdown:
          'Take I-5 south, not the coast route — Hwy 1 rejoins inland past Dana Point anyway.',
        kind: 'travel',
      },
      children: [],
    },
    'stop-4b': {
      type: 'Stop',
      props: {
        time: '1:00 PM',
        title: 'Drop off rental, flight home',
        location: 'SAN',
        kind: 'other',
      },
      children: [],
    },
    'closure-note': {
      type: 'Callout',
      props: {
        variant: 'info',
        title: 'Check Highway 1 status before you go',
        markdown:
          'The Big Sur stretch has a history of slide closures — [check Caltrans QuickMap](https://quickmap.dot.ca.gov/) the morning of Day 1. The Nacimiento-Fergusson Road detour (dashed on the map) is the usual bypass if the coast road is closed south of Big Sur.',
      },
      children: [],
    },
    photo: {
      type: 'Figure',
      props: {
        src: 'https://images.unsplash.com/photo-1449034446853-66c86144b0ad?w=1600&q=80',
        alt: 'Coastal highway curving along cliffs above the Pacific Ocean',
        caption: 'Highway 1 south of Big Sur — the stretch worth the whole detour.',
      },
      children: [],
    },
  },
};

export const roadTripExample = {
  title: 'Pacific Coast Highway: SF to San Diego',
  description: 'A four-day PCH road trip itinerary with the full route mapped out.',
  tags: ['travel', 'demo'],
  spec,
};
