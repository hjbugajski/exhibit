import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';

type Props = CatalogComponentProps<'Figure'>;

export function Figure({ props }: { props: Props }) {
  // The catalog schema enforces https at publish time; re-check here so a hand-edited or legacy row
  // can't downgrade to plain http.
  if (!props.src.startsWith('https://')) {
    return null;
  }

  return (
    <figure className={flowBlock}>
      <img
        alt={props.alt}
        className="border-border w-full rounded-lg border"
        loading="lazy"
        referrerPolicy="no-referrer"
        src={props.src}
      />
      {props.caption ? (
        <figcaption className="text-foreground-muted mt-2 text-sm">{props.caption}</figcaption>
      ) : null}
    </figure>
  );
}
