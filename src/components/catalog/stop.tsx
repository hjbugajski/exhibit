import { BedDouble, Compass, MapPin, Plane, UtensilsCrossed } from 'lucide-react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { MarkdownBody } from '@/components/catalog/markdown-body';
import { Card } from '@/components/ui/card';

type Props = CatalogComponentProps<'Stop'>;

const icons = {
  food: UtensilsCrossed,
  activity: Compass,
  lodging: BedDouble,
  travel: Plane,
  other: MapPin,
} as const;

export function Stop({ props }: { props: Props }) {
  const Icon = icons[props.kind ?? 'other'];

  return (
    /* Icon-side (left) padding one notch tighter so the icon sits optically
       aligned with the card edge — same rule as icon-leading buttons. */
    <Card.Root className="pr-card pl-card-icon flex-row gap-3">
      <Icon aria-hidden className="text-foreground-muted mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-foreground font-semibold">{props.title}</p>
          {props.time ? <span className="text-foreground-muted text-xs">{props.time}</span> : null}
          {props.duration ? (
            <span className="text-foreground-muted text-xs">{props.duration}</span>
          ) : null}
        </div>
        {props.location ? <p className="text-foreground-muted text-sm">{props.location}</p> : null}
        {props.markdown ? <MarkdownBody className="mt-2" markdown={props.markdown} /> : null}
      </div>
    </Card.Root>
  );
}
