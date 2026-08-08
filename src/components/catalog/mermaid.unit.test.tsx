// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Mermaid, MermaidFallback } from '@/components/catalog/mermaid';

/** The real leaf imports mermaid, which needs layout APIs happy-dom doesn't have. */
vi.mock('@/components/catalog/mermaid-inner', () => ({
  default: ({ props }: { props: { code: string } }) => <div>drew {props.code}</div>,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Mermaid', () => {
  it('shows a placeholder of the diagram height before the renderer mounts', () => {
    // Without an IntersectionObserver the wrapper mounts immediately, so take it away.
    vi.stubGlobal('IntersectionObserver', undefined);

    const { container } = render(<Mermaid props={{ code: 'flowchart TD\n A --> B' }} />);

    expect(container.querySelector('.h-64')).toBeTruthy();
    expect(screen.queryByText(/drew/)).toBeNull();
  });

  it('mounts the renderer once the diagram nears the viewport', async () => {
    render(<Mermaid props={{ code: 'flowchart TD\n A --> B' }} />);

    expect(await screen.findByText('drew flowchart TD A --> B')).toBeTruthy();
  });
});

describe('MermaidFallback', () => {
  it('keeps the source visible next to the reason', () => {
    render(<MermaidFallback code="flowchart TD" message="This diagram couldn’t be drawn." />);

    expect(screen.getByText('This diagram couldn’t be drawn.')).toBeTruthy();
    expect(screen.getByText('flowchart TD')).toBeTruthy();
  });
});
