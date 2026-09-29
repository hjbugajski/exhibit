import { catalogDemo } from '@/components/library/catalog-demo';

// Fushimi Inari summit loop: up through the torii tunnels, around the summit circuit, back down.
const romon = { lat: 34.9671, lng: 135.7727 };
const yotsutsuji = { lat: 34.9637, lng: 135.7806 };
const summit = { lat: 34.9632, lng: 135.7862 };

export const catalogTrailDemo = catalogDemo({
  slug: 'catalog-trail',
  title: 'Trail',
  description: 'One hike: stats, a difficulty badge, a track map, and an elevation profile.',
  controls: {
    difficulty: {
      kind: 'select',
      label: 'Difficulty',
      options: ['easy', 'moderate', 'hard', 'strenuous'],
      defaultValue: 'moderate',
    },
    routeType: {
      kind: 'select',
      label: 'Route',
      options: ['loop', 'out-and-back', 'point-to-point'],
      defaultValue: 'loop',
    },
  },
  element: (values) => ({
    type: 'Trail',
    props: {
      name: 'Fushimi Inari summit loop',
      distance: { value: 4.1, unit: 'km' },
      elevationGain: { value: 240, unit: 'm' },
      difficulty: values.difficulty,
      routeType: values.routeType,
      duration: '2 to 3 hours',
      track: [
        romon,
        { lat: 34.9665, lng: 135.7745 },
        { lat: 34.9652, lng: 135.7772 },
        yotsutsuji,
        { lat: 34.9651, lng: 135.7842 },
        summit,
        { lat: 34.9614, lng: 135.7843 },
        yotsutsuji,
        { lat: 34.9652, lng: 135.7772 },
        romon,
      ],
      waypoints: [
        {
          id: 'romon-gate',
          ...romon,
          label: 'Romon Gate',
          description: 'Trailhead at the shrine.',
        },
        { id: 'yotsutsuji', ...yotsutsuji, label: 'Yotsutsuji', description: 'City viewpoint.' },
        { id: 'summit', ...summit, label: 'Ichinomine summit', description: '233 m.' },
      ],
      elevationProfile: [40, 70, 110, 160, 170, 200, 233, 200, 165, 110, 60, 40],
      markdown:
        'Start early to beat the crowds at the Senbon Torii. Vending machines run all the way up, but prices climb with the trail.',
    },
  }),
});
