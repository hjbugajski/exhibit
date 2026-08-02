/**
 * Shared markdown renderer for every catalog component that accepts a `markdown` prop (Prose,
 * Callout, Quote, Steps, Timeline, Details, Stop).
 *
 * The security policy — no raw-HTML pass-through, http(s)-only links, https-only images, fences
 * through the app highlighter — lives in markdown-policy.tsx and is shared with the markdown
 * artifact renderer, so the app has exactly one of it. All this adds is the typography wrapper.
 *
 * Catalog markdown runs the plain profile: no comment directives, no exhibit fences. A spec already
 * expresses component structure directly, so a `markdown` prop never needs to reach back into the
 * catalog.
 */
import { Markdown } from '@tanstack/markdown/react';

import {
  createMarkdownComponents,
  markdownParseOptions,
} from '@/components/markdown/markdown-policy';
import { cn } from '@/lib/utils';

const components = createMarkdownComponents();

type MarkdownBodySize = 'base' | 'sm' | 'lg';

/**
 * 'base' (Prose) keeps the typography plugin's own max-width; 'sm' (the common case) and 'lg'
 * (Quote) both go full-width.
 */
const sizeClass: Record<MarkdownBodySize, string> = {
  base: '',
  sm: 'prose-sm max-w-none',
  lg: 'prose-lg max-w-none',
};

export function MarkdownBody({
  markdown,
  className,
  size = 'sm',
}: {
  markdown: string;
  className?: string;
  size?: MarkdownBodySize;
}) {
  return (
    <div className={cn('prose', sizeClass[size], className)}>
      <Markdown components={components} {...markdownParseOptions}>
        {markdown}
      </Markdown>
    </div>
  );
}
