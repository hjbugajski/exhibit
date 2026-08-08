// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MarkdownBody } from '@/components/catalog/markdown-body';

afterEach(() => {
  cleanup();
});

describe('MarkdownBody', () => {
  // The parser never creates HTML nodes, so raw markup survives as text rather than being stripped.
  // Either way no element is ever constructed from it — assert the escaping, which is the property
  // that actually holds.
  it('renders raw <script> tags as escaped literal text, never as an element', () => {
    const { container } = render(
      <MarkdownBody markdown={'before <script>alert(1)</script> after'} />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.innerHTML).toContain('&lt;script&gt;');
  });

  it('renders a raw <img onerror> as escaped text, with no img and no onerror attribute', () => {
    const { container } = render(<MarkdownBody markdown={'<img src=x onerror=alert(1)>'} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.innerHTML).not.toContain('<img');
  });

  // Catalog markdown is the plain profile: the artifact-only component surfaces must not be
  // reachable from a spec's `markdown` prop.
  it('does not interpret comment directives or exhibit fences', () => {
    const { container } = render(
      <MarkdownBody
        markdown={
          '<!-- ::Divider -->\n\n```exhibit\n{"type":"Heading","props":{"level":2,"text":"nope"}}\n```'
        }
      />,
    );

    expect(container.querySelector('[role="separator"]')).toBeNull();
    expect(container.querySelector('h2')).toBeNull();
    expect(container.querySelector('pre')?.textContent).toContain('"type":"Heading"');
  });

  it('renders a javascript: link as plain text, not an anchor', () => {
    const { container, getByText } = render(<MarkdownBody markdown={'[x](javascript:alert(1))'} />);

    expect(container.querySelector('a')).toBeNull();
    expect(getByText('x')).toBeTruthy();
  });

  it('drops a data: image (https-only images)', () => {
    const { container } = render(
      <MarkdownBody markdown={'![x](data:image/png;base64,aGVsbG8=)'} />,
    );

    expect(container.querySelector('img')).toBeNull();
  });

  it('drops a plain http: image (https-only, not merely http(s))', () => {
    const { container } = render(<MarkdownBody markdown={'![x](http://example.com/a.png)'} />);

    expect(container.querySelector('img')).toBeNull();
  });

  it('renders a working https: anchor with target=_blank and rel=noopener noreferrer', () => {
    const { getByText } = render(<MarkdownBody markdown={'[x](https://example.com)'} />);

    const anchor = getByText('x').closest('a');

    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('href')).toBe('https://example.com');
    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders an https: image', () => {
    const { container } = render(<MarkdownBody markdown={'![x](https://example.com/a.png)'} />);

    const img = container.querySelector('img');

    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/a.png');
  });
});
