import type { ReactNode } from 'react';

import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { Badge } from '@/components/ui/badge';
import { Card as UiCard } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Card'>;
type Trend = NonNullable<Props['trend']>;

const trendStyles: Record<Trend, string> = {
  up: 'text-success',
  down: 'text-danger',
  flat: 'text-foreground-muted',
};

const trendIcons: Record<Trend, typeof Minus> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

function Metric({ props }: { props: Props }) {
  const trend = props.trend ?? 'flat';
  const TrendIcon = trendIcons[trend];

  return (
    <div>
      <p className="text-foreground text-3xl font-semibold tracking-tight tabular-nums">
        {props.value}
      </p>
      {props.delta ? (
        <p className={cn('mt-1 flex items-center gap-1 text-sm', trendStyles[trend])}>
          <TrendIcon className="size-3.5 shrink-0" />
          {props.delta}
        </p>
      ) : null}
    </div>
  );
}

export function Card({ props, children }: { props: Props; children?: ReactNode }) {
  const hasHeader = Boolean(props.title || props.subtitle || props.badge);

  return (
    <UiCard.Root>
      {hasHeader ? (
        <UiCard.Header>
          {props.title ? <UiCard.Title>{props.title}</UiCard.Title> : null}
          {props.subtitle ? <UiCard.Description>{props.subtitle}</UiCard.Description> : null}
          {props.badge ? (
            <UiCard.Action>
              <Badge>{props.badge}</Badge>
            </UiCard.Action>
          ) : null}
        </UiCard.Header>
      ) : null}
      {/* Card-scoped block rhythm (space-y-4) for a heterogeneous children
          list — tighter than Section's space-y-6, since a Card's content is
          already visually contained by the border, so a Card with several
          children (e.g. Badge + Table) never crams. */}
      <UiCard.Content className="space-y-4">
        {props.value ? <Metric props={props} /> : null}
        {children}
      </UiCard.Content>
    </UiCard.Root>
  );
}
