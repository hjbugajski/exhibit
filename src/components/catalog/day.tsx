import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { MAP_MARKERS_MAX } from '@/catalog/catalog';
import type { DayStopMarker } from '@/components/catalog/day-map-context';
import { DayMapContext } from '@/components/catalog/day-map-context';
import { Map } from '@/components/catalog/map';

type Props = CatalogComponentProps<'Day'>;

export function Day({ props, children }: { props: Props; children?: ReactNode }) {
  /*
   * Key insertion order is Stop mount order — document order on first render, though a
   * `visible`-toggled Stop remounts and re-appends. Pins are placed by lat/lng, so order only
   * affects DOM order and drift is harmless.
   */
  const [markers, setMarkers] = useState<Record<string, DayStopMarker>>({});

  const register = useCallback((id: string, marker: DayStopMarker | null) => {
    setMarkers((previous) => {
      const next = { ...previous };

      if (marker) {
        next[id] = marker;
      } else {
        delete next[id];
      }

      return next;
    });
  }, []);

  const markerEntries = Object.entries(markers);

  return (
    <section className="my-8 first:mt-0 last:mb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-foreground text-xl font-semibold tracking-tight">{props.label}</h3>
        {props.date ? <span className="text-foreground-muted text-sm">{props.date}</span> : null}
      </div>
      {props.summary ? <p className="text-foreground-muted mt-2">{props.summary}</p> : null}
      <div className="mt-4">
        {markerEntries.length > 0 ? (
          /*
           * The map deliberately leads the day (overview before detail), whatever the authored
           * child order. The wrapper pulls Map out of its flowBlock tier into the Stop rhythm
           * (my-4; Map's own margins zero out as an only child), keeping map-to-stop and
           * stop-to-stop gaps equal. Capped to mirror the per-Day publish lint (validate.ts) —
           * stored bodies are never re-validated, so the render guard has to stand on its own.
           */
          <div className="my-4 first:mt-0 last:mb-0">
            <Map
              props={{
                markers: markerEntries
                  .slice(0, MAP_MARKERS_MAX)
                  .map(([id, marker]) => ({ id, ...marker })),
              }}
            />
          </div>
        ) : null}
        <DayMapContext.Provider value={register}>{children}</DayMapContext.Provider>
      </div>
    </section>
  );
}
