// @vitest-environment happy-dom
/**
 * The two embedded-component surfaces of a markdown artifact. Both take their name and props from
 * arbitrary AI-authored markdown, so the tests here are mostly about what must NOT happen: no
 * unvalidated attribute reaching the DOM, no unknown component rendering anything.
 */
import { createStateStore } from '@json-render/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MarkdownView } from '@/components/markdown/markdown-view';

/** maplibre-gl needs WebGL, which happy-dom lacks (mirrors registry.unit.test.tsx). */
vi.mock('@/components/catalog/map', () => ({
  Map: () => <div data-testid="catalog-map" />,
}));

/** Stands in for the real diagram and reports the fence body it was handed — what dispatch owes it
 * is the source, not a drawing. */
vi.mock('@/components/catalog/mermaid', () => ({
  Mermaid: ({ props }: { props: { code: string } }) => (
    <div data-code={props.code} data-testid="catalog-mermaid" />
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('comment directives', () => {
  it('renders a catalog component from a directive, with its markdown children inside', () => {
    const { container } = render(
      <MarkdownView
        markdown={'<!-- ::start:Card title="Budget" -->\n\nSpend **less**.\n\n<!-- ::end:Card -->'}
      />,
    );

    expect(screen.getByText('Budget')).toBeTruthy();
    expect(container.querySelector('strong')?.textContent).toBe('less');
    expect(container.querySelector('md-comment-component')).toBeNull();
  });

  it('renders a directive with no children, without an empty prose wrapper', () => {
    const { container } = render(<MarkdownView markdown="<!-- ::Divider -->" />);

    expect(container.querySelector('[role="separator"]')).toBeTruthy();
    // The renderer hands childless directives an empty array; it must not become an empty
    // `[data-md-prose]` div (dead space inside components that lay out their children).
    expect(container.querySelector('[data-md-prose]')).toBeNull();
  });

  // Directive attributes are flat strings, so a schema needing numbers or arrays (Grid's columns,
  // Tabs' items) can never validate from one — the block renders nothing. Pinned so the
  // publish_markdown description keeps steering those components at exhibit fences and specs.
  it('renders nothing for a directive whose schema needs non-string props', () => {
    const { container } = render(
      <MarkdownView
        markdown={'<!-- ::start:Grid columns="2" -->\n\ncell\n\n<!-- ::end:Grid -->'}
      />,
    );

    expect(container.querySelector('[data-md-embed]')).toBeNull();
    expect(container.textContent).not.toContain('cell');
  });

  // The parser lowercases directive names; the catalog is PascalCase.
  it('resolves a directive name case-insensitively', () => {
    render(<MarkdownView markdown={'<!-- ::CARD title="Loud" -->'} />);

    expect(screen.getByText('Loud')).toBeTruthy();
  });

  it('renders nothing for an unknown component name', () => {
    const { container } = render(
      <MarkdownView markdown={'a\n\n<!-- ::NotAComponent foo="bar" -->\n\nb'} />,
    );

    expect(container.textContent).not.toContain('bar');
    expect(container.textContent).not.toContain('NotAComponent');
    expect(container.querySelector('md-comment-component')).toBeNull();
  });

  it('renders nothing when the attributes fail the component’s schema', () => {
    // Callout's `variant` is an enum and `markdown` is required; neither is satisfied here.
    const { container } = render(<MarkdownView markdown={'<!-- ::Callout variant="banana" -->'} />);

    expect(container.textContent).not.toContain('banana');
  });

  /**
   * Hostile attributes must go through the schema (which strips unknown keys), never onto an
   * element. Also covers the unmapped-node shape: @tanstack/markdown serializes attributes into a
   * `data-attributes` blob on a literal `<md-comment-component>`, which must never appear either.
   */
  it('never lets a directive attribute reach the DOM', () => {
    const { container } = render(
      <MarkdownView
        markdown={
          '<!-- ::Card title="ok" onclick="alert(1)" href="javascript:alert(1)" dangerouslySetInnerHTML="x" -->'
        }
      />,
    );

    expect(container.querySelector('[onclick]')).toBeNull();
    expect(container.querySelector('[href]')).toBeNull();
    expect(container.innerHTML).not.toContain('onclick');
    expect(container.innerHTML).not.toContain('alert(1)');
    expect(container.innerHTML).not.toContain('dangerouslySetInnerHTML');
    // The valid prop still rendered, so the component itself was not skipped.
    expect(screen.getByText('ok')).toBeTruthy();
  });
});

describe('exhibit fences', () => {
  it('renders a validated component from an exhibit fence', () => {
    const { container } = render(
      <MarkdownView
        markdown={'```exhibit\n{"type":"Heading","props":{"level":2,"text":"From a fence"}}\n```'}
      />,
    );

    expect(screen.getByText('From a fence')).toBeTruthy();
    // The fence renders the component, not a code block of its JSON.
    expect(container.querySelector('pre')).toBeNull();
  });

  it('degrades an unparseable fence to a code block plus an error', () => {
    const { container } = render(<MarkdownView markdown={'```exhibit\nnot json\n```'} />);

    expect(container.querySelector('pre')?.textContent).toBe('not json');
    expect(container.querySelector('.text-danger')).toBeTruthy();
  });

  it('degrades a fence whose props fail validation to a code block plus the reason', () => {
    const json = '{"type":"Chart","props":{"kind":"pie"}}';
    const { container } = render(<MarkdownView markdown={`\`\`\`exhibit\n${json}\n\`\`\``} />);

    expect(container.querySelector('pre')?.textContent).toBe(json);
    const message = container.querySelector('.text-danger')?.textContent;

    expect(message).toContain('didn’t validate');
    // The offending prop's path, not just the bare Zod message — `data` is the missing prop here,
    // and the adjacent JSON can't reveal a key that isn't in it.
    expect(message).toContain('props.data');
  });

  it('treats the fence language case-insensitively', () => {
    const { container } = render(
      <MarkdownView
        markdown={'```Exhibit\n{"type":"Heading","props":{"level":2,"text":"Cased"}}\n```'}
      />,
    );

    expect(screen.getByText('Cased')).toBeTruthy();
    expect(container.querySelector('pre')).toBeNull();
  });

  it('degrades an unknown component name in a fence rather than rendering it', () => {
    const { container } = render(
      <MarkdownView markdown={'```exhibit\n{"type":"NotAComponent","props":{}}\n```'} />,
    );

    expect(container.querySelector('.text-danger')).toBeTruthy();
  });

  it('leaves a non-exhibit fence as highlighted code', () => {
    const { container } = render(<MarkdownView markdown={'```json\n{"type":"Heading"}\n```'} />);

    expect(container.querySelector('pre')?.textContent).toBe('{"type":"Heading"}');
    expect(container.querySelector('.text-danger')).toBeNull();
  });
});

describe('mermaid fences', () => {
  it.each(['mermaid', 'Mermaid'])('renders a %s fence as a diagram, not code', (language) => {
    const code = 'flowchart TD\n  a --> b';
    const { container } = render(<MarkdownView markdown={`\`\`\`${language}\n${code}\n\`\`\``} />);

    expect(screen.getByTestId('catalog-mermaid').dataset.code).toBe(code);
    expect(container.querySelector('pre')).toBeNull();
  });
});

describe('embedded component state', () => {
  it('round-trips a checklist toggle from an exhibit fence through the shared store', () => {
    const store = createStateStore({});
    const json = JSON.stringify({
      type: 'Checklist',
      props: { items: [{ id: 'a', text: 'Book the plumber', statePath: '/tasks/plumber' }] },
    });

    render(<MarkdownView markdown={`\`\`\`exhibit\n${json}\n\`\`\``} store={store} />);

    // Clicking the text, not the box: the label re-dispatches a click on the control itself.
    fireEvent.click(screen.getByText('Book the plumber'));

    expect(store.getSnapshot()).toEqual({ tasks: { plumber: true } });
  });

  it('seeds an embedded checklist from previously saved state', () => {
    const store = createStateStore({ tasks: { plumber: true } });
    const json = JSON.stringify({
      type: 'Checklist',
      props: { items: [{ id: 'a', text: 'Book the plumber', statePath: '/tasks/plumber' }] },
    });

    render(<MarkdownView markdown={`\`\`\`exhibit\n${json}\n\`\`\``} store={store} />);

    expect(
      screen.getByRole('checkbox', { name: 'Book the plumber' }).getAttribute('aria-checked'),
    ).toBe('true');
  });
});
