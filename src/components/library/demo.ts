import type { ReactNode } from 'react';

export type LibraryGroup = 'Components' | 'Catalog' | 'Examples';

/** One sidebar entry / page in the `/dev/library` component library. */
export interface LibraryDemo {
  /** URL segment, kebab-case, unique across the registry. */
  slug: string;
  title: string;
  /** One-sentence summary shown under the page title. */
  description: string;
  group: LibraryGroup;
  render: () => ReactNode;
}
