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
  // One rank below the level: the artifact title is the page's only h1.
  const Tag = `h${props.level + 1}` as 'h2' | 'h3' | 'h4';
  // An all-non-Latin heading slugifies to '' — an empty id attribute is invalid, so fall back to
  // no id at all rather than render one.
  const slug = slugify(props.text);

  return (
    <Tag
      // not-prose: inside a markdown embed, typography's rules for the tag would tie with these
      // utilities and win on emission order; levelClass stays the single source of the scale.
      className={cn(
        'not-prose text-foreground font-semibold tracking-tight first:mt-0 last:mb-0',
        levelClass[props.level],
      )}
      id={slug || undefined}
    >
      {props.text}
    </Tag>
  );
}
