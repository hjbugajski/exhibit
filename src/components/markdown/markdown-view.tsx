import type { StateStore } from '@json-render/core';
import { JSONUIProvider } from '@json-render/react';
import type { ParseOptions } from '@tanstack/markdown';
import { commentComponentsExtension } from '@tanstack/markdown/extensions/comment-components';
import type { MarkdownComponents } from '@tanstack/markdown/react';
import { Markdown } from '@tanstack/markdown/react';

import { registry } from '@/catalog/registry';
import { Mermaid } from '@/components/catalog/mermaid';
import { CatalogDirective, ExhibitBlock } from '@/components/markdown/catalog-dispatch';
import {
  createMarkdownComponents,
  highlightFence,
  type FenceRenderer,
} from '@/components/markdown/markdown-policy';
import { markdownParseOptions } from '@/lib/markdown-parse-options';
import { cn } from '@/lib/utils';

/** `exhibit` fences are catalog components and `mermaid` fences are diagrams (either casing, like
 * fence languages generally); every other fence is code. */
const renderFence: FenceRenderer = (code, language) => {
  switch (language.toLowerCase()) {
    case 'exhibit': {
      return <ExhibitBlock json={code} />;
    }
    case 'mermaid': {
      return <Mermaid props={{ code }} />;
    }
    default: {
      return highlightFence(code, language);
    }
  }
};

const components: MarkdownComponents = {
  ...createMarkdownComponents(renderFence),
  // MANDATORY. Without this mapping the renderer emits a literal <md-comment-component> element
  // carrying the directive's attributes as one serialized data blob — see catalog-dispatch.tsx.
  'md-comment-component': CatalogDirective,
};

const options: ParseOptions = {
  ...markdownParseOptions,
  extensions: [commentComponentsExtension()],
};

/**
 * Renders a markdown artifact body. The security contract lives in markdown-policy.tsx and
 * catalog-dispatch.tsx; this is the artifact-shaped wrapper around them — full-width prose, plus
 * the `JSONUIProvider` that lets embedded catalog components read and write `store` exactly as they
 * do inside a spec.
 *
 * Two deliberate behavior differences from other markdown Claude may have written for: raw HTML
 * shows as literal text rather than being stripped, and bare URLs do not autolink (write explicit
 * `[text](url)` links). Both are documented in the publish_markdown tool description.
 */
export function MarkdownView({
  markdown,
  store,
  className,
}: {
  markdown: string;
  store?: StateStore;
  className?: string;
}) {
  return (
    <JSONUIProvider registry={registry} store={store}>
      <div className={cn('prose max-w-none', className)}>
        <Markdown components={components} {...options}>
          {markdown}
        </Markdown>
      </div>
    </JSONUIProvider>
  );
}
