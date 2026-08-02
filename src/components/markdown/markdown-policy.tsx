/**
 * The one markdown security policy. Every markdown surface in the app parses and renders through
 * these options and this components map, so the properties below hold in exactly one place:
 *
 * - `allowHtml` is never set. @tanstack/markdown's parser only produces HTML nodes when it is true,
 *   and `dangerouslySetInnerHTML` only ever appears on those nodes — so with the default, raw
 *   `<script>alert(1)</script>` in a body comes back as literal text that React escapes. Never set
 *   it, and never pass a `highlighter` callback either: that option's return value is injected as
 *   raw HTML.
 * - `frontmatter: false` — a `---` line partway down an artifact body must stay a thematic break,
 *   not retroactively turn the top of the document into frontmatter.
 * - `headingIds: false` — ids generated from artifact-authored headings would collide with the
 *   app's own element ids.
 * - The library's URL sanitizer is a floor, not the house policy: it also permits `mailto:`, `tel:`
 *   and relative hrefs, and rewrites an unsafe image src to `src=""` — which makes the browser
 *   refetch the current page URL. So `a` and `img` below re-impose the rule instead. Links render
 *   as `<a>` only for `http(s)` (with `rel="noopener noreferrer"` and `target="_blank"`) and for
 *   same-document `#` fragments, which carry no scheme or origin — that is how footnote references
 *   and backreferences navigate, and the renderer prefixes their generated ids with `user-content-`
 *   so they cannot shadow the app's own element ids. Images render only for `https:`, with
 *   `referrerPolicy="no-referrer"` (an artifact-chosen host must not learn the gallery origin —
 *   the same rule Figure and the raw routes apply); anything else renders as its own text, or not
 *   at all.
 *
 * Beyond security, the map is also what keeps markdown speaking the catalog's visual language:
 * fences render as the catalog CodeBlock, GFM tables as the house Table parts, and task-list
 * checkboxes as the house Checkbox — typography's generic defaults never show where a house
 * equivalent exists.
 */
import type { ReactNode } from 'react';

import type { ParseOptions } from '@tanstack/markdown';
import type { MarkdownComponentProps, MarkdownComponents } from '@tanstack/markdown/react';

import { CodeBlock } from '@/components/catalog/code-block';
import { flowBlock } from '@/components/catalog/flow';
import { Checkbox } from '@/components/ui/checkbox';
import { Table } from '@/components/ui/table';

const HTTP_URL = /^https?:\/\//i;
const HTTPS_URL = /^https:\/\//i;

/** The class the renderer puts on a fenced block's `<code>`; the lang is `plaintext` when absent. */
const FENCE_LANGUAGE = /^language-(.+)$/;

export const markdownParseOptions: ParseOptions = { frontmatter: false, headingIds: false };

/** Renders one fenced code block: its raw text plus the language as the author spelled it. */
export type FenceRenderer = (code: string, language: string) => ReactNode;

/**
 * Default fence rendering: the catalog CodeBlock, so a fence in markdown and a CodeBlock in a spec
 * are the same block (header, copy button, plain-text fallback for unknown languages). A bare
 * fence's `plaintext` marker is elided so the header shows CodeBlock's own "code" placeholder.
 */
export const highlightFence: FenceRenderer = (code, language) => (
  <CodeBlock props={{ code, language: language === 'plaintext' ? undefined : language }} />
);

function MarkdownLink({ href, id, children }: MarkdownComponentProps<'a'>) {
  if (typeof href === 'string' && HTTP_URL.test(href)) {
    return (
      <a href={href} rel="noopener noreferrer" target="_blank">
        {children}
      </a>
    );
  }

  // Same-document fragments: no target/_blank/rel (there is no other document), and `id` carries
  // through because a footnote reference is also the backreference's landing target.
  if (typeof href === 'string' && href.startsWith('#')) {
    return (
      <a href={href} id={id}>
        {children}
      </a>
    );
  }

  return <>{children}</>;
}

function MarkdownImage({ src, alt }: MarkdownComponentProps<'img'>) {
  if (typeof src === 'string' && HTTPS_URL.test(src)) {
    return (
      <img alt={alt ?? ''} decoding="async" loading="lazy" referrerPolicy="no-referrer" src={src} />
    );
  }

  return null;
}

/**
 * `renderFence` overrides how fenced blocks render (artifact bodies intercept the `exhibit`
 * language); everything else is the fixed house policy.
 */
export function createMarkdownComponents(
  renderFence: FenceRenderer = highlightFence,
): MarkdownComponents {
  return {
    a: MarkdownLink,
    img: MarkdownImage,
    // The renderer wraps every fence in its own <pre>; unwrap it so the fence renderer owns the
    // whole block (CodeBlock brings its own container).
    pre: ({ children }: MarkdownComponentProps<'pre'>) => <>{children}</>,
    code: ({ className, children }: MarkdownComponentProps<'code'>) => {
      const language =
        typeof className === 'string' ? FENCE_LANGUAGE.exec(className)?.[1] : undefined;

      // Inline code spans arrive with no language class; a fence always has one, and its only child
      // is the raw fence text.
      return language !== undefined && typeof children === 'string' ? (
        renderFence(children, language)
      ) : (
        <code>{children}</code>
      );
    },
    // GFM tables through the house table shell, so a markdown table and the catalog Table
    // component are the same table. The flow wrapper carries the rhythm; typography's margin on
    // the inner <table> is cancelled by the unlayered `.prose [data-slot='table']` rule in
    // styles.css (a `my-0` utility ties with typography and loses on order); border-0/py-0 cancel
    // the border and padding typography adds on thead/th that the parts express on other elements.
    table: ({ children }: MarkdownComponentProps<'table'>) => (
      <div className={flowBlock}>
        <Table.Root>{children}</Table.Root>
      </div>
    ),
    thead: (props: MarkdownComponentProps<'thead'>) => (
      <Table.Header className="border-0" {...props} />
    ),
    tbody: (props: MarkdownComponentProps<'tbody'>) => <Table.Body {...props} />,
    tr: (props: MarkdownComponentProps<'tr'>) => <Table.Row {...props} />,
    th: (props: MarkdownComponentProps<'th'>) => <Table.Head className="py-0" {...props} />,
    td: (props: MarkdownComponentProps<'td'>) => <Table.Cell {...props} />,
    // The only input markdown can produce is a GFM task-list checkbox (raw HTML never parses);
    // render it as the house Checkbox so task lists match the catalog Checklist. `data-md-task`
    // is the styles.css hook: layout and the checked strikethrough key on it, so an embedded
    // catalog Checklist (whose boxes lack the marker) is never restyled by task-list rules.
    input: ({ type, checked, disabled }: MarkdownComponentProps<'input'>) =>
      type === 'checkbox' ? (
        <Checkbox checked={Boolean(checked)} data-md-task="" disabled={Boolean(disabled)} />
      ) : null,
  };
}
