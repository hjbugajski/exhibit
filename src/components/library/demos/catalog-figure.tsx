import { catalogDemo } from '@/components/library/catalog-demo';

// Network-loaded placeholder image, same tradeoff as the Map demo's tile server.
const SRC = 'https://picsum.photos/800/450';

export const catalogFigureDemo = catalogDemo({
  slug: 'catalog-figure',
  title: 'Figure',
  description: 'Image with an optional caption; the source must be a publicly reachable https URL.',
  controls: {
    caption: { kind: 'text', label: 'Caption', defaultValue: 'View from the ryokan balcony' },
    alt: { kind: 'text', label: 'Alt text', defaultValue: 'Misty mountain valley at dawn' },
  },
  element: (values) => ({
    type: 'Figure',
    props: { src: SRC, alt: values.alt, caption: values.caption },
  }),
});
