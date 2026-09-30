import type { ReactNode } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { MAP_MARKERS_MAX } from '@/catalog/catalog';
import type { ItineraryDay } from '@/catalog/stop-markers';
import { flowSection, flowTight } from '@/components/catalog/flow';
import { Map } from '@/components/catalog/map';
import { slugify } from '@/lib/slugify';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Itinerary'>;

/**
 * Every day's pins on one map, unnumbered, with one dashed route per day. The pins are capped in
 * document order to mirror the trip publish lint (validate.ts), and each route keeps only its
 * day's pins that made the cut.
 */
function tripMapProps(days: ItineraryDay[]): CatalogComponentProps<'Map'> {
  let remaining = MAP_MARKERS_MAX;
  const shown = days.map((day) => {
    const markers = day.markers.slice(0, remaining);

    remaining -= markers.length;

    return { key: day.key, markers };
  });

  return {
    markers: shown.flatMap((day) => day.markers),
    paths: shown
      .filter((day) => day.markers.length >= 2)
      .map((day) => ({
        id: `route-${day.key}`,
        dashed: true,
        points: day.markers.map(({ lat, lng }) => ({ lat, lng })),
      })),
  };
}

/**
 * `days` are the Days under the Itinerary, read from the spec by the registry adapter
 * (registry.tsx). Two or more mapped days add a trip map; two or more days add an index of links to
 * each Day's `id`.
 */
export function Itinerary({
  props,
  days = [],
  children,
}: {
  props: Props;
  days?: ItineraryDay[];
  children?: ReactNode;
}) {
  const hasHeader = Boolean(props.title || props.dateRange);
  const mappedDays = days.filter((day) => day.markers.length > 0);

  return (
    <div className={flowSection}>
      {hasHeader ? (
        <div>
          {props.title ? (
            <h2 className="text-foreground text-2xl font-semibold tracking-tight">{props.title}</h2>
          ) : null}
          {props.dateRange ? (
            <p className="text-foreground-muted mt-2 text-sm">{props.dateRange}</p>
          ) : null}
        </div>
      ) : null}
      <div className={cn(hasHeader && 'mt-8')}>
        {mappedDays.length >= 2 ? (
          <div className={flowTight}>
            <Map props={tripMapProps(mappedDays)} />
          </div>
        ) : null}
        {days.length >= 2 ? <DayIndex days={days} /> : null}
        {children}
      </div>
    </div>
  );
}

function DayIndex({ days }: { days: ItineraryDay[] }) {
  return (
    <nav aria-label="Days" className={flowTight}>
      <ol className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {days.map((day) => {
          // Same slug as the Day's own id (day.tsx); a label with no slug has nothing to link to.
          const slug = slugify(day.label);

          return (
            <li className="min-w-0" key={day.key}>
              {slug ? (
                <a
                  className="text-foreground-muted hover:text-foreground underline-offset-4 hover:underline"
                  href={`#${slug}`}
                >
                  {day.label}
                </a>
              ) : (
                <span className="text-foreground-muted">{day.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
