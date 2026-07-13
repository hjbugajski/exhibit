import type { ReactNode } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';

type Props = CatalogComponentProps<'Day'>;

export function Day({ props, children }: { props: Props; children?: ReactNode }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-foreground text-xl font-semibold tracking-tight">{props.label}</h3>
        {props.date ? <span className="text-foreground-muted text-sm">{props.date}</span> : null}
      </div>
      {props.summary ? <p className="text-foreground-muted mt-2">{props.summary}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
