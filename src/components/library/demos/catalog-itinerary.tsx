import { catalogDemo } from '@/components/library/catalog-demo';

// Covers Itinerary + Day + Stop together: all seven Stop kinds, every optional Stop field (url,
// cost, status, transit with and without duration), and two mapped days, so the Itinerary adds a
// trip map and a day index above numbered day maps. Day 1 opens with a Weather strip; day 2 pairs
// a hike Stop with its Trail.
export const catalogItineraryDemo = catalogDemo({
  slug: 'catalog-itinerary',
  title: 'Itinerary',
  description:
    'Itinerary, Day, and Stop together: a trip of days, each a list of stops. Stops with coordinates add numbered day maps and a trip map; transit shows how you get from one stop to the next.',
  root: 'itinerary',
  elements: {
    itinerary: {
      type: 'Itinerary',
      props: { title: 'Kyoto and Nara', dateRange: 'May 3 – May 4, 2026' },
      children: ['day-1', 'day-2'],
    },
    'day-1': {
      type: 'Day',
      props: {
        label: 'Day 1: Kyoto',
        date: 'May 3, 2026',
        summary: 'Eastern Kyoto temples and a night in Gion.',
      },
      children: ['weather-1', 'stop-1a', 'stop-1b', 'stop-1c'],
    },
    'weather-1': {
      type: 'Weather',
      props: {
        source: 'static',
        unit: 'c',
        label: 'Trip forecast',
        days: [
          { date: 'May 3', high: 22, low: 14, condition: 'clear', precipitationChance: 0 },
          { date: 'May 4', high: 21, low: 15, condition: 'partly-cloudy', precipitationChance: 10 },
        ],
      },
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
        url: 'https://www.japan-guide.com/e/e3915.html',
        status: 'planned',
      },
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
        cost: '¥1,500',
        status: 'optional',
        transit: { mode: 'transit', duration: '25 min' },
      },
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
        transit: { mode: 'walk', duration: '10 min' },
      },
    },
    'day-2': {
      type: 'Day',
      props: {
        label: 'Day 2: Nara',
        date: 'May 4, 2026',
        summary: 'A day trip to Nara Park and Mount Wakakusa.',
      },
      children: ['stop-2a', 'stop-2b', 'trail-2', 'stop-2c', 'stop-2d'],
    },
    'stop-2a': {
      type: 'Stop',
      props: {
        time: '8:30 AM',
        duration: '45 minutes',
        title: 'Kintetsu Limited Express to Nara',
        location: 'Kintetsu-Nara Station',
        coordinates: { lat: 34.6843, lng: 135.8279 },
        kind: 'travel',
        cost: '¥1,280',
        status: 'booked',
        transit: { mode: 'transit' },
      },
    },
    'stop-2b': {
      type: 'Stop',
      props: {
        time: '10:00 AM',
        duration: '2 hours',
        title: 'Mount Wakakusa climb',
        location: 'Nara Park',
        coordinates: { lat: 34.6883, lng: 135.8481 },
        kind: 'hike',
        cost: '¥150',
        status: 'planned',
        transit: { mode: 'walk', duration: '25 min' },
      },
    },
    'trail-2': {
      type: 'Trail',
      props: {
        name: 'Mount Wakakusa',
        distance: { value: 2.8, unit: 'km' },
        elevationGain: { value: 230, unit: 'm' },
        difficulty: 'moderate',
        routeType: 'out-and-back',
        duration: '1.5 hours',
        track: [
          { lat: 34.6865, lng: 135.8466 },
          { lat: 34.6874, lng: 135.8487 },
          { lat: 34.6883, lng: 135.8508 },
          { lat: 34.6874, lng: 135.8487 },
          { lat: 34.6865, lng: 135.8466 },
        ],
        waypoints: [
          { id: 'gate', lat: 34.6865, lng: 135.8466, label: 'South gate' },
          { id: 'summit', lat: 34.6883, lng: 135.8508, label: 'Summit' },
        ],
        elevationProfile: [110, 170, 240, 300, 340, 300, 240, 170, 110],
        markdown: 'The south gate closes at 5 PM; deer graze all the way to the summit.',
      },
    },
    'stop-2c': {
      type: 'Stop',
      props: {
        time: '1:00 PM',
        duration: '1 hour',
        title: 'Higashimuki shopping street',
        location: 'Nara',
        coordinates: { lat: 34.6832, lng: 135.8293 },
        kind: 'shopping',
        cost: '¥2,000',
        status: 'optional',
        transit: { mode: 'walk', duration: '30 min' },
      },
    },
    'stop-2d': {
      type: 'Stop',
      props: {
        time: '4:00 PM',
        title: 'Coin locker pickup',
        markdown: 'Grab the bags left at the station locker before the train back.',
        kind: 'other',
        transit: { mode: 'walk', duration: '5 min' },
      },
    },
  },
});
