import type { ReactNode } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { MAP_MARKERS_MAX } from '@/catalog/catalog';
import type { StopMarker } from '@/catalog/stop-markers';
import { flowStandout, flowTight } from '@/components/catalog/flow';
import { Map } from '@/components/catalog/map';
import { slugify } from '@/lib/slugify';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Day'>;

/**
 * The day's Stops as a numbered route: pins labelled `1. Title` in document order, joined by one
 * dashed path. Dashed, because the path draws straight segments, not the road. Capped to mirror the
 * per-Day publish lint (validate.ts): stored bodies are never re-validated, so the render guard has
 * to stand on its own.
 */
function routeMapProps(markers: StopMarker[]): CatalogComponentProps<'Map'> {
  const pins = markers.slice(0, MAP_MARKERS_MAX);

  return {
    markers: pins.map((marker, index) => ({ ...marker, label: `${index + 1}. ${marker.label}` })),
    paths:
      pins.length >= 2
        ? [{ id: 'route', dashed: true, points: pins.map(({ lat, lng }) => ({ lat, lng })) }]
        : undefined,
  };
}

/**
 * `markers` are the day's Stop pins, read from the spec by the registry adapter (registry.tsx)
 * before render, so the map is in the first render. The markdown path passes none and renders no
 * map.
 */
export function Day({
  props,
  markers = [],
  children,
}: {
  props: Props;
  markers?: StopMarker[];
  children?: ReactNode;
}) {
  // An all-symbol label slugifies to '', and an empty id attribute is invalid.
  const slug = slugify(props.label);

  return (
    <section className={cn('scroll-mt-16', flowStandout)} id={slug || undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="not-prose text-foreground text-xl font-semibold tracking-tight">
          {props.label}
        </h3>
        {props.date ? <span className="text-foreground-muted text-sm">{props.date}</span> : null}
      </div>
      {props.summary ? <p className="text-foreground-muted mt-2">{props.summary}</p> : null}
      <div className="mt-4">
        {markers.length > 0 ? (
          /*
           * The map deliberately leads the day (overview before detail), whatever the authored
           * child order. The wrapper pulls Map out of its flowBlock tier into the Stop rhythm
           * (flowTight; Map's own margins zero out as an only child), keeping map-to-stop and
           * stop-to-stop gaps equal.
           */
          <div className={flowTight}>
            <Map props={routeMapProps(markers)} />
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}
