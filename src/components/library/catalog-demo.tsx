import type { Spec, UIElement } from '@json-render/core';

import { SpecView } from '@/catalog/registry';
import type { LibraryDemo } from '@/components/library/demo';
import {
  Playground,
  type PlaygroundControls,
  type PlaygroundValues,
} from '@/components/library/playground';

type Elements = Record<string, UIElement>;

/** Either a fixed value or one derived from the current playground values. */
type Dynamic<C extends PlaygroundControls, T> = T | ((values: PlaygroundValues<C>) => T);

/**
 * A demo is either a single element — the factory supplies the spec root — or a full element map
 * with an explicit root key. `children` defaults to `[]` on every element.
 */
type CatalogDemoConfig<C extends PlaygroundControls> = {
  slug: string;
  title: string;
  /** One-sentence summary shown under the page title; hand-written, not derived from the catalog. */
  description: string;
  controls?: C;
} & ({ element: Dynamic<C, UIElement> } | { root: string; elements: Dynamic<C, Elements> });

const SINGLE_ROOT = 'root';

/** Flattens both config shapes to one root key plus a source of elements. */
function sourceOf<C extends PlaygroundControls>(
  config: CatalogDemoConfig<C>,
): { root: string; source: Dynamic<C, Elements> } {
  if (!('element' in config)) {
    return { root: config.root, source: config.elements };
  }

  const { element } = config;

  return {
    root: SINGLE_ROOT,
    source:
      typeof element === 'function'
        ? (values) => ({ [SINGLE_ROOT]: element(values) })
        : { [SINGLE_ROOT]: element },
  };
}

function normalize(elements: Elements): Elements {
  return Object.fromEntries(
    Object.entries(elements).map(([key, element]) => [
      key,
      element.children ? element : { ...element, children: [] },
    ]),
  );
}

/**
 * Builds a `/dev/library` page for one catalog component: a block-layout playground rendering the
 * spec through the catalog registry, plus the registry metadata.
 */
export function catalogDemo<const C extends PlaygroundControls = PlaygroundControls>(
  config: CatalogDemoConfig<C>,
): LibraryDemo {
  const { root, source } = sourceOf(config);
  let toSpec: (values: PlaygroundValues<C>) => Spec;

  if (typeof source === 'function') {
    toSpec = (values) => ({ root, elements: normalize(source(values)) });
  } else {
    // Built once: a stable spec identity keeps interactive previews (Checklist, Choice, …) from
    // resetting on every playground render.
    const spec: Spec = { root, elements: normalize(source) };

    toSpec = () => spec;
  }

  return {
    slug: config.slug,
    title: config.title,
    description: config.description,
    group: 'Catalog',
    render: () => (
      <Playground
        controls={(config.controls ?? {}) as C}
        layout="block"
        render={(values) => <SpecView spec={toSpec(values)} />}
      />
    ),
  };
}
