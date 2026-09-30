import type { Spec } from '@json-render/core';

/**
 * Uses the live Weather source, which no fixture can: the forecast is fetched when the artifact is
 * viewed, so the dates are whatever the next seven days are. Pairs it with a static strip for
 * comparison, two Trails of different grades, and an Itinerary whose stops carry coordinates so the
 * trip map, the day maps and the day index all render.
 */
const spec: Spec = {
  root: 'root',
  elements: {
    root: {
      type: 'Section',
      props: { title: 'Yosemite Valley Weekend', subtitle: 'Two days, two hikes' },
      children: ['forecast-live', 'forecast-typical', 'itinerary', 'packing'],
    },
    'forecast-live': {
      type: 'Weather',
      props: {
        source: 'live',
        label: 'Yosemite Valley, next 7 days',
        location: { lat: 37.7456, lng: -119.5936 },
        unit: 'f',
        dayCount: 7,
      },
      children: [],
    },
    'forecast-typical': {
      type: 'Weather',
      props: {
        source: 'static',
        unit: 'f',
        label: 'Typical early October',
        summary: 'Warm afternoons, cold mornings. Start hikes in a layer you can shed.',
        days: [
          { date: 'Fri', high: 74, low: 44, condition: 'clear', precipitationChance: 0 },
          { date: 'Sat', high: 72, low: 43, condition: 'partly-cloudy', precipitationChance: 10 },
          { date: 'Sun', high: 66, low: 40, condition: 'rain', precipitationChance: 60 },
        ],
      },
      children: [],
    },
    itinerary: {
      type: 'Itinerary',
      props: { title: 'The plan', dateRange: 'Saturday and Sunday' },
      children: ['day-1', 'day-2'],
    },
    'day-1': {
      type: 'Day',
      props: {
        label: 'Day 1: Mist Trail',
        summary: 'The valley classic, up past two waterfalls.',
      },
      children: ['stop-1a', 'stop-1b', 'trail-1', 'stop-1c', 'stop-1d'],
    },
    'stop-1a': {
      type: 'Stop',
      props: {
        time: '6:30 AM',
        title: 'Coffee at Degnan’s Kitchen',
        location: 'Yosemite Village',
        coordinates: { lat: 37.7485, lng: -119.5871 },
        kind: 'food',
        cost: '$12',
        status: 'optional',
      },
      children: [],
    },
    'stop-1b': {
      type: 'Stop',
      props: {
        time: '7:15 AM',
        duration: '5 hours',
        title: 'Mist Trail to Nevada Fall',
        location: 'Happy Isles trailhead',
        coordinates: { lat: 37.7325, lng: -119.5578 },
        kind: 'hike',
        status: 'planned',
        url: 'https://www.nps.gov/yose/planyourvisit/vernalnevadatrail.htm',
        transit: { mode: 'transit', duration: '20 min' },
        markdown: 'Take the valley shuttle to stop 16; the trailhead lot fills before 7.',
      },
      children: [],
    },
    'trail-1': {
      type: 'Trail',
      props: {
        name: 'Mist Trail to Nevada Fall',
        distance: { value: 5.4, unit: 'mi' },
        elevationGain: { value: 2000, unit: 'ft' },
        difficulty: 'strenuous',
        routeType: 'out-and-back',
        duration: '5 to 6 hours',
        track: [
          { lat: 37.7325, lng: -119.5578 },
          { lat: 37.7289, lng: -119.5519 },
          { lat: 37.7273, lng: -119.5437 },
          { lat: 37.7262, lng: -119.5383 },
          { lat: 37.725, lng: -119.5331 },
        ],
        waypoints: [
          { id: 'happy-isles', lat: 37.7325, lng: -119.5578, label: 'Happy Isles' },
          { id: 'vernal', lat: 37.7273, lng: -119.5437, label: 'Vernal Fall' },
          { id: 'nevada', lat: 37.725, lng: -119.5331, label: 'Nevada Fall' },
        ],
        elevationProfile: [4035, 4300, 4600, 5050, 5100, 5400, 5700, 5970],
        markdown:
          'The granite steps below Vernal Fall are wet and slick in spring. No permit is needed for a day hike to Nevada Fall.',
      },
      children: [],
    },
    'stop-1c': {
      type: 'Stop',
      props: {
        time: '2:00 PM',
        duration: '1 hour',
        title: 'Late lunch at Curry Village',
        location: 'Curry Village',
        coordinates: { lat: 37.7377, lng: -119.5722 },
        kind: 'food',
        cost: '$25 pp',
        transit: { mode: 'walk', duration: '25 min' },
      },
      children: [],
    },
    'stop-1d': {
      type: 'Stop',
      props: {
        time: '4:00 PM',
        title: 'Check in: Yosemite Valley Lodge',
        location: 'Yosemite Valley',
        coordinates: { lat: 37.7436, lng: -119.5983 },
        kind: 'lodging',
        cost: '$289 / night',
        status: 'booked',
        url: 'https://www.travelyosemite.com/lodging/yosemite-valley-lodge/',
        transit: { mode: 'transit', duration: '15 min' },
      },
      children: [],
    },
    'day-2': {
      type: 'Day',
      props: {
        label: 'Day 2: Valley floor',
        summary: 'An easy loop before the drive home.',
      },
      children: ['stop-2a', 'trail-2', 'stop-2b', 'stop-2c'],
    },
    'stop-2a': {
      type: 'Stop',
      props: {
        time: '8:00 AM',
        duration: '1.5 hours',
        title: 'Lower Yosemite Fall loop',
        location: 'Yosemite Falls trailhead',
        coordinates: { lat: 37.7466, lng: -119.596 },
        kind: 'hike',
        status: 'planned',
        transit: { mode: 'walk', duration: '10 min' },
      },
      children: [],
    },
    'trail-2': {
      type: 'Trail',
      props: {
        name: 'Lower Yosemite Fall',
        distance: { value: 1.2, unit: 'mi' },
        elevationGain: { value: 50, unit: 'ft' },
        difficulty: 'easy',
        routeType: 'loop',
        duration: '30 to 45 minutes',
        track: [
          { lat: 37.7466, lng: -119.596 },
          { lat: 37.7497, lng: -119.5968 },
          { lat: 37.7509, lng: -119.5952 },
          { lat: 37.7488, lng: -119.5931 },
          { lat: 37.7466, lng: -119.596 },
        ],
        elevationProfile: [3970, 3985, 4010, 4020, 4000, 3975, 3970],
        markdown: 'Paved and wheelchair accessible on the eastern half of the loop.',
      },
      children: [],
    },
    'stop-2b': {
      type: 'Stop',
      props: {
        time: '10:30 AM',
        duration: '45 minutes',
        title: 'Ansel Adams Gallery',
        location: 'Yosemite Village',
        coordinates: { lat: 37.7484, lng: -119.5868 },
        kind: 'shopping',
        status: 'optional',
        transit: { mode: 'bike', duration: '10 min' },
      },
      children: [],
    },
    'stop-2c': {
      type: 'Stop',
      props: {
        time: '12:00 PM',
        duration: '30 minutes',
        title: 'Tunnel View on the way out',
        location: 'Wawona Road',
        coordinates: { lat: 37.7158, lng: -119.6773 },
        kind: 'activity',
        transit: { mode: 'drive', duration: '20 min' },
      },
      children: [],
    },
    packing: {
      type: 'Checklist',
      props: {
        items: [
          { id: 'water', text: '3 liters of water each', statePath: '/packing/water' },
          {
            id: 'shell',
            text: 'Rain shell for the Mist Trail spray',
            statePath: '/packing/shell',
          },
          { id: 'headlamp', text: 'Headlamp', statePath: '/packing/headlamp' },
          { id: 'pass', text: 'Park entrance pass', statePath: '/packing/pass' },
        ],
      },
      children: [],
    },
  },
};

export const yosemiteWeekendExample = {
  title: 'Yosemite Valley Weekend',
  description: 'A two-day hiking trip with a live forecast, two graded trails and mapped stops.',
  tags: ['travel', 'hiking', 'demo'],
  spec,
};
