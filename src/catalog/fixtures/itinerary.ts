import type { Spec } from '@json-render/core';

/**
 * Uses Itinerary/Day/Stop richly: three mapped days (so the Itinerary adds a trip map and a day
 * index), mixed stop kinds, markdown with a link, and every optional Stop field. Day 1 opens with a
 * Weather strip; day 3 pairs a hike Stop with a Trail. `stop-1a` and `stop-1b` stay plain: the
 * get_catalog example is trimmed to them (catalog-summary.ts), so new props go on the other stops.
 */
export const itineraryFixture: Spec = {
  root: 'itinerary',
  elements: {
    itinerary: {
      type: 'Itinerary',
      props: { title: 'Kyoto in Three Days', dateRange: 'May 3 to 5, 2026' },
      children: ['day-1', 'day-2', 'day-3'],
    },
    'day-1': {
      type: 'Day',
      props: {
        label: 'Day 1: Sunday',
        date: 'May 3, 2026',
        summary: 'Eastern Kyoto temples and tea.',
      },
      children: ['weather-1', 'stop-1a', 'stop-1b', 'stop-1c'],
    },
    'weather-1': {
      type: 'Weather',
      props: {
        source: 'static',
        unit: 'c',
        label: 'Trip forecast',
        summary: 'Dry for the hike; pack a light layer for the evenings.',
        days: [
          { date: 'May 3', high: 22, low: 14, condition: 'clear', precipitationChance: 0 },
          { date: 'May 4', high: 21, low: 15, condition: 'partly-cloudy', precipitationChance: 10 },
          { date: 'May 5', high: 19, low: 12, condition: 'cloudy', precipitationChance: 20 },
        ],
      },
      children: [],
    },
    'stop-1a': {
      type: 'Stop',
      props: {
        time: '9:00 AM',
        duration: '2 hours',
        title: 'Fushimi Inari Shrine',
        location: 'Fushimi-ku',
        coordinates: { lat: 34.9671, lng: 135.7727 },
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
        coordinates: { lat: 35.0037, lng: 135.778 },
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
        coordinates: { lat: 35.0031, lng: 135.7726 },
        kind: 'lodging',
        url: 'https://www.granbellhotel.jp/',
        cost: '¥24,000 / night',
        status: 'booked',
        transit: { mode: 'walk', duration: '5 min' },
      },
      children: [],
    },
    'day-2': {
      type: 'Day',
      props: {
        label: 'Day 2: Monday',
        date: 'May 4, 2026',
        summary: 'Arashiyama and the market.',
      },
      children: ['stop-2a', 'stop-2b', 'stop-2c'],
    },
    'stop-2a': {
      type: 'Stop',
      props: {
        time: '8:30 AM',
        duration: '2 hours',
        title: 'Arashiyama Bamboo Grove',
        location: 'Arashiyama',
        coordinates: { lat: 35.017, lng: 135.6713 },
        kind: 'activity',
        status: 'planned',
        transit: { mode: 'transit', duration: '35 min' },
      },
      children: [],
    },
    'stop-2b': {
      type: 'Stop',
      props: {
        time: '12:30 PM',
        duration: '1.5 hours',
        title: 'Nishiki Market',
        location: 'Nakagyo-ku',
        coordinates: { lat: 35.005, lng: 135.7649 },
        markdown: 'Graze on skewers and pickles; most stalls take cash only.',
        kind: 'shopping',
        cost: '¥3,000',
        status: 'optional',
        transit: { mode: 'transit', duration: '30 min' },
      },
      children: [],
    },
    'stop-2c': {
      type: 'Stop',
      props: {
        time: '7:00 PM',
        title: 'Kaiseki dinner at Gion Karyo',
        location: 'Gion',
        coordinates: { lat: 35.0036, lng: 135.7752 },
        kind: 'food',
        cost: '¥13,000 pp',
        status: 'booked',
        transit: { mode: 'walk', duration: '20 min' },
      },
      children: [],
    },
    'day-3': {
      type: 'Day',
      props: {
        label: 'Day 3: Tuesday',
        date: 'May 5, 2026',
        summary: 'Mountain temples north of the city.',
      },
      children: ['stop-3a', 'stop-3b', 'trail-3', 'stop-3c'],
    },
    'stop-3a': {
      type: 'Stop',
      props: {
        time: '8:00 AM',
        duration: '30 minutes',
        title: 'Eizan Railway to Kurama',
        location: 'Demachiyanagi Station',
        coordinates: { lat: 35.0304, lng: 135.7729 },
        kind: 'travel',
        url: 'https://eizandensha.co.jp/',
        cost: '¥470',
        transit: { mode: 'transit', duration: '25 min' },
      },
      children: [],
    },
    'stop-3b': {
      type: 'Stop',
      props: {
        time: '9:00 AM',
        duration: '3 hours',
        title: 'Kurama to Kibune hike',
        location: 'Kurama-dera',
        coordinates: { lat: 35.118, lng: 135.7706 },
        kind: 'hike',
        status: 'planned',
        transit: { mode: 'walk', duration: '5 min' },
      },
      children: [],
    },
    'trail-3': {
      type: 'Trail',
      props: {
        name: 'Kurama to Kibune',
        distance: { value: 3.6, unit: 'km' },
        elevationGain: { value: 330, unit: 'm' },
        difficulty: 'moderate',
        routeType: 'point-to-point',
        duration: '2 to 3 hours',
        track: [
          { lat: 35.1155, lng: 135.7708 },
          { lat: 35.118, lng: 135.7706 },
          { lat: 35.1206, lng: 135.7672 },
          { lat: 35.1223, lng: 135.7641 },
          { lat: 35.124, lng: 135.763 },
        ],
        waypoints: [
          { id: 'kurama', lat: 35.1155, lng: 135.7708, label: 'Kurama Station' },
          { id: 'kibune', lat: 35.124, lng: 135.763, label: 'Kibune Shrine' },
        ],
        elevationProfile: [240, 330, 410, 480, 540, 570, 480, 360, 290],
        markdown: 'Temple admission is ¥500. The cedar-root path is slick after rain.',
      },
      children: [],
    },
    'stop-3c': {
      type: 'Stop',
      props: {
        time: '12:30 PM',
        duration: '1.5 hours',
        title: 'Riverside lunch in Kibune',
        location: 'Kibune',
        coordinates: { lat: 35.1234, lng: 135.7636 },
        markdown: 'Platforms over the stream (kawadoko) run from May to September.',
        kind: 'food',
        cost: '¥6,000 pp',
        status: 'booked',
        transit: { mode: 'walk', duration: '10 min' },
      },
      children: [],
    },
  },
};
