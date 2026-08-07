// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CatalogMermaidInner from '@/components/catalog/mermaid-inner';
import { MERMAID_MAX_CHARS } from '@/components/catalog/mermaid-policy';

/** DOMPurify needs a browser-accurate `nodeName` before it loads (see the helper). */
await vi.hoisted(async () => {
  const { patchNodeName } = await import('@testing/happy-dom-node-name');

  patchNodeName();
});

/**
 * mermaid itself needs layout APIs happy-dom doesn't have, and its output is exactly what this
 * suite treats as hostile: the stub hands back whatever SVG a compromised render would.
 */
const mermaid = vi.hoisted(() => ({
  detectType: vi.fn<(code: string) => string>(),
  render: vi.fn<(id: string, code: string) => Promise<{ svg: string }>>(),
}));

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), detectType: mermaid.detectType, render: mermaid.render },
}));

/** A drawn flowchart carrying every payload the pipeline is supposed to strip. */
const HOSTILE_SVG =
  '<svg viewBox="0 0 200 100"><g><text x="1" onclick="alert(1)">Label</text></g>' +
  '<path d="M0 0"/><script>alert(2)</script></svg>';

function renderDiagram(code = 'flowchart TD\n  A --> B') {
  return render(<CatalogMermaidInner props={{ code }} />);
}

/** Renders the default diagram and returns the frame it lands in. */
async function frame(): Promise<HTMLIFrameElement> {
  renderDiagram();

  return (await screen.findByTitle('Flowchart')) as HTMLIFrameElement;
}

beforeEach(() => {
  mermaid.detectType.mockReturnValue('flowchart');
  mermaid.render.mockResolvedValue({ svg: HOSTILE_SVG });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CatalogMermaidInner', () => {
  it('frames the diagram with scripting fully denied', async () => {
    // Exactly empty: any token here, allow-scripts above all, hands the diagram an executing origin.
    expect((await frame()).getAttribute('sandbox')).toBe('');
  });

  it('locks the framed document down with the meta CSP', async () => {
    expect((await frame()).getAttribute('srcdoc')).toContain(
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">',
    );
  });

  it('sanitizes mermaid output before it reaches the frame', async () => {
    const srcdoc = (await frame()).getAttribute('srcdoc') ?? '';

    expect(srcdoc).not.toContain('script');
    expect(srcdoc).not.toContain('alert(');
    expect(srcdoc).not.toContain('onclick');
    // The diagram itself survives, so the assertions above are not passing on an empty document.
    expect(srcdoc).toContain('<path d="M0 0"');
    expect(srcdoc).toContain('Label');
  });

  it('sizes the frame from the sanitized SVG', async () => {
    expect((await frame()).style.aspectRatio).toBe('2 / 1');
  });

  it('degrades to the source when the diagram is over the character cap', async () => {
    renderDiagram(`flowchart TD\n${'  A --> B\n'.repeat(MERMAID_MAX_CHARS)}`);

    expect(await screen.findByText(/longer than 10,000 characters/)).toBeTruthy();
    expect(screen.queryByTitle('Flowchart')).toBeNull();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it('degrades to the source when the diagram type is not allowlisted', async () => {
    mermaid.detectType.mockReturnValue('mindmap');
    renderDiagram('mindmap\n  root((x))');

    expect(await screen.findByText(/diagrams render here/)).toBeTruthy();
    expect(screen.queryByTitle('Flowchart')).toBeNull();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it('degrades to the source when detectType rejects the diagram outright', async () => {
    mermaid.detectType.mockImplementation(() => {
      throw new Error('UnknownDiagramError');
    });
    renderDiagram('nonsense');

    expect(await screen.findByText(/diagrams render here/)).toBeTruthy();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it('degrades to the source when the render throws', async () => {
    mermaid.render.mockRejectedValue(new Error('parse error'));
    renderDiagram();

    expect(await screen.findByText('This diagram couldn’t be drawn.')).toBeTruthy();
  });

  it('degrades to the source when sanitizing leaves no diagram', async () => {
    mermaid.render.mockResolvedValue({ svg: '<script>alert(1)</script>' });
    renderDiagram();

    expect(await screen.findByText('This diagram couldn’t be drawn.')).toBeTruthy();
    expect(screen.queryByTitle('Flowchart')).toBeNull();
  });
});
