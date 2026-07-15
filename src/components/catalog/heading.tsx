import type { CatalogComponentProps } from '@/catalog/catalog';
import { slugify } from '@/lib/slugify';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Heading'>;

/**
 * Spec content sits under the page chrome, whose artifact title is text-3xl — nothing inside a
 * rendered spec exceeds text-2xl.
 */
const levelClass = {
  1: 'text-2xl mt-12 mb-4',
  2: 'text-xl mt-12 mb-4',
  3: 'text-lg mt-8 mb-4',
} as const;

export function Heading({ props }: { props: Props }) {
  const Tag = `h${props.level}` as 'h1' | 'h2' | 'h3';
  // An all-non-Latin heading slugifies to '' — an empty id attribute is invalid, so fall back to
  // no id at all rather than render one.
  const slug = slugify(props.text);

  return (
    <Tag
      className={cn(
        'text-foreground font-semibold tracking-tight first:mt-0 last:mb-0',
        levelClass[props.level],
      )}
      id={slug || undefined}
    >
      {props.text}
    </Tag>
  );
}
