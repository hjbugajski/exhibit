import type { Spec } from '@json-render/core';

/**
 * Uses Map with multiple markers and a route path, plus Itinerary/Day/Stop for a road trip —
 * distinct from the Kyoto itinerary: drive legs as Stop transit, booking status, costs and links,
 * a Weather strip, a hike Stop with its Trail, and a real dashed-path detour. The stops carry no
 * coordinates, so the hand-built route Map stays the trip overview.
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
      children: ['weather', 'stop-1a', 'stop-1b', 'stop-1c'],
    },
    weather: {
      type: 'Weather',
      props: {
        source: 'static',
        unit: 'f',
        label: 'Coast forecast',
        summary: 'Morning fog north of Big Sur burns off by noon.',
        days: [
          { date: 'Fri, Sep 11', high: 68, low: 55, condition: 'fog', precipitationChance: 10 },
          {
            date: 'Sat, Sep 12',
            high: 72,
            low: 56,
            condition: 'partly-cloudy',
            precipitationChance: 0,
          },
          { date: 'Sun, Sep 13', high: 78, low: 62, condition: 'clear', precipitationChance: 0 },
          { date: 'Mon, Sep 14', high: 76, low: 64, condition: 'clear', precipitationChance: 0 },
        ],
      },
      children: [],
    },
    'stop-1a': {
      type: 'Stop',
      props: {
        time: '8:00 AM',
        duration: '30 minutes',
        title: 'Pick up rental car',
        location: 'SFO',
        kind: 'other',
        cost: '$412 for 4 days',
        status: 'booked',
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
        cost: '$20',
        status: 'optional',
        transit: { mode: 'drive', duration: '1.5 hours' },
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
        url: 'https://www.postranchinn.com/',
        cost: '$1,650 / night',
        status: 'booked',
        transit: { mode: 'drive', duration: '2.5 hours' },
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
      children: ['stop-2a', 'trail-2a', 'stop-2b'],
    },
    'stop-2a': {
      type: 'Stop',
      props: {
        time: '7:30 AM',
        duration: '1 hour',
        title: 'McWay Falls',
        location: 'Julia Pfeiffer Burns State Park',
        markdown: 'Go at sunrise — the overlook parking lot fills by 9 AM in September.',
        kind: 'hike',
        url: 'https://www.parks.ca.gov/?page_id=578',
        cost: '$10 parking',
        status: 'planned',
        transit: { mode: 'drive', duration: '15 min' },
      },
      children: [],
    },
    'trail-2a': {
      type: 'Trail',
      props: {
        name: 'McWay Falls Overlook Trail',
        distance: { value: 0.6, unit: 'mi' },
        elevationGain: { value: 50, unit: 'ft' },
        difficulty: 'easy',
        routeType: 'out-and-back',
        duration: '30 minutes',
        track: [
          { lat: 36.1596, lng: -121.6698 },
          { lat: 36.1588, lng: -121.6712 },
          { lat: 36.1579, lng: -121.6721 },
        ],
        waypoints: [
          { id: 'parking', lat: 36.1596, lng: -121.6698, label: 'Day-use parking' },
          { id: 'overlook', lat: 36.1579, lng: -121.6721, label: 'Falls overlook' },
        ],
      },
      children: [],
    },
    'stop-2b': {
      type: 'Stop',
      props: {
        time: '2:00 PM',
        duration: '3 hours',
        title: 'State Street & East Beach',
        location: 'Santa Barbara',
        markdown: 'Fuel up in Cambria on the way — no gas stations for the next 40 miles south.',
        kind: 'activity',
        transit: { mode: 'drive', duration: '3.5 hours' },
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
        title: 'Getty Center',
        location: 'Brentwood',
        kind: 'activity',
        url: 'https://www.getty.edu/visit/center/',
        cost: '$25 parking',
        status: 'optional',
        transit: { mode: 'drive', duration: '1.5 hours' },
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
        cost: '$289 / night',
        status: 'booked',
        transit: { mode: 'drive', duration: '30 min' },
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
        duration: '2 hours',
        title: 'Balboa Park',
        location: 'San Diego',
        markdown:
          'Take I-5 south, not the coast route — Hwy 1 rejoins inland past Dana Point anyway.',
        kind: 'activity',
        status: 'optional',
        transit: { mode: 'drive', duration: '2.5 hours' },
      },
      children: [],
    },
    'stop-4b': {
      type: 'Stop',
      props: {
        time: '1:00 PM',
        title: 'Drop off rental, flight home',
        location: 'SAN',
        kind: 'travel',
        status: 'booked',
        transit: { mode: 'drive', duration: '20 min' },
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
