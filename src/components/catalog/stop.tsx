import {
  ArrowUpRight,
  BedDouble,
  Bike,
  Car,
  Compass,
  Footprints,
  MapPin,
  Mountain,
  Plane,
  Ship,
  ShoppingBag,
  TrainFront,
  UtensilsCrossed,
} from 'lucide-react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowTight } from '@/components/catalog/flow';
import { MarkdownBody } from '@/components/catalog/markdown-body';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Stop'>;
type Transit = NonNullable<Props['transit']>;

const kindIcons = {
  food: UtensilsCrossed,
  activity: Compass,
  lodging: BedDouble,
  travel: Plane,
  hike: Mountain,
  shopping: ShoppingBag,
  other: MapPin,
} as const;

const transitModes = {
  walk: { icon: Footprints, label: 'Walk' },
  transit: { icon: TrainFront, label: 'Transit' },
  drive: { icon: Car, label: 'Drive' },
  bike: { icon: Bike, label: 'Bike' },
  flight: { icon: Plane, label: 'Flight' },
  boat: { icon: Ship, label: 'Boat' },
} as const;

const statusBadges: Record<
  NonNullable<Props['status']>,
  { variant: NonNullable<BadgeProps['variant']>; label: string }
> = {
  booked: { variant: 'success', label: 'Booked' },
  planned: { variant: 'default', label: 'Planned' },
  optional: { variant: 'outline', label: 'Optional' },
};

/**
 * Same render-time guard as Table links (table.tsx): stored bodies are never re-validated, so a
 * non-http(s) url degrades to plain text.
 */
const HTTP_URL = /^https?:\/\//i;

function Title({ title, url }: { title: string; url?: string }) {
  if (!url || !HTTP_URL.test(url)) {
    return <p className="text-foreground font-semibold">{title}</p>;
  }

  return (
    <p className="font-semibold">
      <a
        className="text-accent underline underline-offset-4"
        href={url}
        rel="noopener noreferrer"
        target="_blank"
      >
        {title}
        <ArrowUpRight aria-hidden className="ml-0.5 inline size-3.5" data-icon="inline-end" />
      </a>
    </p>
  );
}

/** How the traveller gets here from the previous stop, drawn between the two cards. */
function TransitLine({ transit }: { transit: Transit }) {
  const { icon: Icon, label } = transitModes[transit.mode];

  return (
    <p className="text-foreground-muted pl-card-icon gap-icon-label mb-2 flex items-center text-xs">
      <Icon aria-hidden className="size-3.5 shrink-0" data-icon="inline-start" />
      {transit.duration ? `${label} · ${transit.duration}` : label}
    </p>
  );
}

export function Stop({ props }: { props: Props }) {
  const Icon = kindIcons[props.kind ?? 'other'];
  const status = props.status ? statusBadges[props.status] : null;

  const card = (
    /* Icon-side (left) padding one notch tighter so the icon sits optically
       aligned with the card edge — same rule as icon-leading buttons. */
    <Card.Root className={cn('pr-card pl-card-icon flex-row gap-3', !props.transit && flowTight)}>
      <Icon aria-hidden className="text-foreground-muted mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Title title={props.title} url={props.url} />
          {props.time ? <span className="text-foreground-muted text-xs">{props.time}</span> : null}
          {props.duration ? (
            <span className="text-foreground-muted text-xs">{props.duration}</span>
          ) : null}
          {props.cost ? (
            <span className="text-foreground-muted text-xs tabular-nums">{props.cost}</span>
          ) : null}
          {status ? (
            <Badge className="ml-auto" variant={status.variant}>
              {status.label}
            </Badge>
          ) : null}
        </div>
        {props.location ? <p className="text-foreground-muted text-sm">{props.location}</p> : null}
        {props.markdown ? <MarkdownBody className="mt-2" markdown={props.markdown} /> : null}
      </div>
    </Card.Root>
  );

  if (!props.transit) {
    return card;
  }

  // The connector and the card move as one block in the Stop rhythm.
  return (
    <div className={flowTight}>
      <TransitLine transit={props.transit} />
      {card}
    </div>
  );
}
