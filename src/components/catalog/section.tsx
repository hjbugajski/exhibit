import type { ReactNode } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowSection } from '@/components/catalog/flow';
import { slugify } from '@/lib/slugify';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Section'>;

export function Section({ props, children }: { props: Props; children?: ReactNode }) {
  const hasHeader = Boolean(props.title || props.subtitle);
  // An all-non-Latin title slugifies to '' — an empty id attribute is invalid, so fall back to no
  // id at all rather than render one.
  const slug = props.title ? slugify(props.title) : '';

  return (
    <section className={flowSection} id={slug || undefined}>
      {props.title ? (
        <h2 className="text-foreground text-2xl font-semibold tracking-tight">{props.title}</h2>
      ) : null}
      {props.subtitle ? <p className="text-foreground-muted mt-2">{props.subtitle}</p> : null}
      {/* Body children space themselves via their own collapsing flow margins (see flow.ts) —
          the body div only offsets the whole block from the header. */}
      <div className={cn(hasHeader && 'mt-8')}>{children}</div>
    </section>
  );
}
