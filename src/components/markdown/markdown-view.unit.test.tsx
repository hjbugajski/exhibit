// @vitest-environment happy-dom
/**
 * The security contract for every markdown surface in the app (markdown-policy.tsx), pinned against
 * a third-party 0.0.x parser. These assertions are what an upgrade of @tanstack/markdown has to keep
 * green — a body published through publish_markdown is arbitrary AI-authored text, and this is the
 * only thing between it and the owner's authenticated origin.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MarkdownView } from '@/components/markdown/markdown-view';

afterEach(() => {
  cleanup();
});

describe('MarkdownView URL policy', () => {
  it('renders a javascript: link as plain text, not an anchor', () => {
    const { container, getByText } = render(<MarkdownView markdown="[x](javascript:alert(1))" />);

    expect(container.querySelector('a')).toBeNull();
    expect(getByText('x')).toBeTruthy();
  });

  it('renders a data: link as plain text, not an anchor', () => {
    const { container, getByText } = render(
      <MarkdownView markdown="[x](data:text/html,<script>alert(1)</script>)" />,
    );

    expect(container.querySelector('a')).toBeNull();
    expect(getByText(/x/)).toBeTruthy();
  });

  // The library's own sanitizer allows these; the house policy is http(s)-only.
  it.each(['mailto:someone@example.com', 'tel:+15550100', '/relative/path'])(
    'renders a %s link as plain text, not an anchor',
    (href) => {
      const { container } = render(<MarkdownView markdown={`[x](${href})`} />);

      expect(container.querySelector('a')).toBeNull();
    },
  );

  it('renders an https: anchor with target=_blank and rel=noopener noreferrer', () => {
    const { getByText } = render(<MarkdownView markdown="[x](https://example.com)" />);
    const anchor = getByText('x').closest('a');

    expect(anchor?.getAttribute('href')).toBe('https://example.com');
    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('drops a plain http: image (https-only, not merely http(s))', () => {
    const { container } = render(<MarkdownView markdown="![x](http://example.com/a.png)" />);

    expect(container.querySelector('img')).toBeNull();
  });

  it('drops a data: image', () => {
    const { container } = render(<MarkdownView markdown="![x](data:image/png;base64,aGVsbG8=)" />);

    expect(container.querySelector('img')).toBeNull();
  });

  // The parser rewrites an unsafe src to the empty string, which makes a rendered <img> refetch the
  // current page URL. Dropping the element is what avoids that.
  it('drops a javascript: image rather than rendering it with an empty src', () => {
    const { container } = render(<MarkdownView markdown="![x](javascript:alert(1))" />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[src=""]')).toBeNull();
  });

  it('renders an https: image with no-referrer and lazy loading', () => {
    const { container } = render(<MarkdownView markdown="![x](https://example.com/a.png)" />);
    const img = container.querySelector('img');

    expect(img?.getAttribute('src')).toBe('https://example.com/a.png');
    // Same rule as Figure and the raw routes: an artifact-chosen host never learns the gallery
    // origin.
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('decoding')).toBe('async');
  });
});

describe('MarkdownView raw HTML', () => {
  it('renders a raw <script> block as escaped literal text, never as an element', () => {
    const { container } = render(
      <MarkdownView markdown={'before\n\n<script>alert(1)</script>\n\nafter'} />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.innerHTML).toContain('&lt;script&gt;');
  });

  it('renders a raw <img onerror> as escaped literal text, with no img and no onerror attribute', () => {
    const { container } = render(<MarkdownView markdown="<img src=x onerror=alert(1)>" />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.innerHTML).not.toContain('<img');
  });

  it('renders inline raw HTML as escaped literal text', () => {
    const { container } = render(
      <MarkdownView markdown="text with <b>bold</b> and <iframe src=https://evil.example></iframe>" />,
    );

    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('<b>bold</b>');
  });
});

describe('MarkdownView parse options', () => {
  // A `---` partway down a body must stay a thematic break; with frontmatter parsing on, a body that
  // happens to start with `---` would silently lose its opening section instead.
  it('does not treat a leading --- block as frontmatter', () => {
    const { container } = render(
      <MarkdownView markdown={'---\ntitle: Secret\n---\n\nvisible body'} />,
    );

    expect(container.textContent).toContain('title: Secret');
    expect(container.textContent).toContain('visible body');
  });

  it('does not put ids on headings', () => {
    const { container } = render(<MarkdownView markdown="# A Heading" />);

    expect(container.querySelector('h1')?.getAttribute('id')).toBeNull();
  });
});

describe('MarkdownView rendering', () => {
  it('renders GFM tables, task lists, and strikethrough through the house components', () => {
    const { container } = render(
      <MarkdownView
        markdown={'| a | b |\n| --- | --- |\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~struck~~'}
      />,
    );

    // The house Table shell, not a bare typography table.
    expect(container.querySelector('[data-slot="table-container"]')).toBeTruthy();
    expect(container.querySelectorAll('table th')).toHaveLength(2);
    expect(container.querySelectorAll('table tbody td')).toHaveLength(2);

    // Task-list checkboxes are the house Checkbox (a button with role=checkbox), read-only like
    // the catalog Checklist's static items — never disabled, which would dim them while an
    // equivalent Checklist paints at full strength.
    const checkboxes = container.querySelectorAll('[data-slot="checkbox"]');

    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]?.getAttribute('aria-checked')).toBe('true');
    expect(checkboxes[1]?.getAttribute('aria-checked')).toBe('false');
    expect(checkboxes[0]?.hasAttribute('data-disabled')).toBe(false);
    expect(checkboxes[0]?.hasAttribute('data-readonly')).toBe(true);
    expect(container.querySelector('del')?.textContent).toBe('struck');
  });

  it('renders GFM footnotes as same-document links, both directions', () => {
    const { container } = render(<MarkdownView markdown={'Text[^1]\n\n[^1]: The note.'} />);

    // The reference links down to the note and is itself the backreference's landing target.
    const reference = container.querySelector('sup a[href="#user-content-fn-1"]');

    expect(reference?.getAttribute('id')).toBe('user-content-fnref-1');
    expect(reference?.getAttribute('target')).toBeNull();
    expect(
      container.querySelector('li#user-content-fn-1 a[href="#user-content-fnref-1"]'),
    ).toBeTruthy();
  });

  /**
   * The task-list CSS in styles.css keys on these two structures: tight items put the checkbox
   * directly under the li, loose (blank-line-separated) items wrap it in a paragraph, and ordered
   * task lists are legal. Pins the 0.0.x parser's output shape so an upgrade that moves the
   * checkbox breaks here, not silently in the styling.
   */
  it('marks task-list checkboxes with data-md-task in tight, loose, and ordered lists', () => {
    // Prose between the lists keeps them three separate lists; the blank line inside the second
    // makes it (and only it) loose.
    const { container } = render(
      <MarkdownView
        markdown={
          '- [x] tight\n- [ ] tight two\n\nbetween\n\n- [x] loose a\n\n- [ ] loose b\n\nbetween\n\n1. [ ] ordered'
        }
      />,
    );

    expect(container.querySelector('ul > li > [data-md-task]')).toBeTruthy();
    expect(container.querySelector('ul > li > p > [data-md-task]')).toBeTruthy();
    expect(
      container.querySelector('ol > li > [data-md-task], ol > li > p > [data-md-task]'),
    ).toBeTruthy();
  });

  it('renders a fenced code block through the highlighter, with the source text intact', () => {
    const { container } = render(<MarkdownView markdown={'```ts\nconst x: number = 1;\n```'} />);

    const pre = container.querySelector('pre');

    expect(pre?.textContent).toBe('const x: number = 1;');
    expect(pre?.querySelectorAll('.th-token').length).toBeGreaterThan(0);
  });

  it('renders inline code as a code span, not a fence', () => {
    const { container } = render(<MarkdownView markdown="use `npm run gate` first" />);

    expect(container.querySelector('pre')).toBeNull();
    expect(container.querySelector('code')?.textContent).toBe('npm run gate');
  });

  // No timing assertion on purpose (those flake): vitest's per-test timeout is the bound. This fails
  // by hanging if the parser ever loses its DoS budgets.
  it('renders a 200KB pathological input to completion', () => {
    const markdown = '['.repeat(50_000) + 'x'.repeat(50_000) + '*_`'.repeat(50_000);
    const { container } = render(<MarkdownView markdown={markdown} />);

    expect(container.textContent?.length).toBeGreaterThan(0);
  });
});
