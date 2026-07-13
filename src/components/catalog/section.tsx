import type { ReactNode } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { slugify } from '@/lib/slugify';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Section'>;

export function Section({ props, children }: { props: Props; children?: ReactNode }) {
  const hasHeader = Boolean(props.title || props.subtitle);
  // An all-non-Latin title slugifies to '' — an empty id attribute is invalid, so fall back to no
  // id at all rather than render one.
  const slug = props.title ? slugify(props.title) : '';

  return (
    <section className="mt-12 first:mt-0" id={slug || undefined}>
      {props.title ? (
        <h2 className="text-foreground text-2xl font-semibold tracking-tight">{props.title}</h2>
      ) : null}
      {props.subtitle ? <p className="text-foreground-muted mt-2">{props.subtitle}</p> : null}
      {/* Section-scoped block rhythm (space-y-6): any top-level container that renders a
          heterogeneous `children` list directly (not through Grid/Columns) uses this margin
          spacing, so Prose→Table, Card→Callout etc. never cram or double-space regardless of
          composition order. Card uses a tighter space-y-4 for its own nested content (see
          card.tsx). */}
      <div className={cn('space-y-6', hasHeader && 'mt-8')}>{children}</div>
    </section>
  );
}
