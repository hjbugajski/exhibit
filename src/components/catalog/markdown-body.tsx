/**
 * Shared markdown renderer for every catalog component that accepts a `markdown` prop (Prose,
 * Callout, Quote, Steps, Timeline, Details, Stop). Centralizing this is what makes the security
 * properties easy to reason about and test in one place:
 *
 * - `skipHtml` drops raw HTML from the markdown source entirely (CommonMark only — no raw-HTML
 *   pass-through). There is no `dangerouslySetInnerHTML` anywhere; react-markdown renders to React
 *   elements.
 * - `remark-gfm` is enabled for tables, strikethrough, autolinks, and task lists — useful for the
 *   itinerary/comparison/explainer content this app renders, at negligible cost.
 * - Links only render as `<a>` when the href is `http(s)`; anything else (e.g. `javascript:`,
 *   `data:`) renders as plain text. Rendered links get `rel="noopener noreferrer"` and
 *   `target="_blank"`.
 * - Images only render when the `src` is `https:`; anything else (including plain `http:`) is
 *   dropped.
 */
import type { Components as MarkdownComponents } from 'react-markdown';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

const HTTP_URL = /^https?:\/\//i;
const HTTPS_URL = /^https:\/\//i;

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

const components: MarkdownComponents = {
  a: ({ href, children }) => {
    if (typeof href === 'string' && HTTP_URL.test(href)) {
      return (
        <a href={href} rel="noopener noreferrer" target="_blank">
          {children}
        </a>
      );
    }

    return <>{children}</>;
  },
  img: ({ src, alt }) => {
    if (typeof src === 'string' && HTTPS_URL.test(src)) {
      return <img alt={alt ?? ''} src={src} />;
    }

    return null;
  },
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
      <Markdown components={components} remarkPlugins={[remarkGfm]} skipHtml>
        {markdown}
      </Markdown>
    </div>
  );
}
