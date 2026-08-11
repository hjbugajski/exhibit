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

const HOUSE = 'flowchart TD\n A --> B';
// A family the house engine leaves alone and mermaid.js draws.
const STOCK = 'gantt\n  title Release\n  section Build\n  Catalog work :2026-01-05, 12d';
// A house family whose header detects and whose body then hits a layout limit: clusters nest past
// the depth the engine will route through.
const TOO_DEEP = `flowchart TD
  subgraph s1
    subgraph s2
      subgraph s3
        subgraph s4
          subgraph s5
            subgraph s6
              a --> b
            end
          end
        end
      end
    end
  end`;
// The other fatal stage: a header that detects over a body with nothing parseable under it.
const UNPARSEABLE = 'flowchart TD\n A[oops\n B(oops';

describe('Mermaid', () => {
  it('draws a family the house engine knows without mermaid or a frame', () => {
    const { container } = render(<Mermaid props={{ code: HOUSE }} />);

    expect(container.querySelector('[data-part="svg"]')).toBeTruthy();
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByText(/drew/)).toBeNull();
  });

  it('draws the house family eagerly, with no viewport gate to wait on', () => {
    // The lazy path needs an observer to mount; the house path must not care that there is none.
    vi.stubGlobal('IntersectionObserver', undefined);

    const { container } = render(<Mermaid props={{ code: HOUSE }} />);

    expect(container.querySelector('[data-part="svg"]')).toBeTruthy();
    expect(container.querySelector('.h-64')).toBeNull();
  });

  it('shows a placeholder of the diagram height before the stock renderer mounts', () => {
    // Without an IntersectionObserver the wrapper mounts immediately, so take it away.
    vi.stubGlobal('IntersectionObserver', undefined);

    const { container } = render(<Mermaid props={{ code: STOCK }} />);

    expect(container.querySelector('.h-64')).toBeTruthy();
    expect(screen.queryByText(/drew/)).toBeNull();
  });

  it('mounts the stock renderer once a deferred family nears the viewport', async () => {
    render(<Mermaid props={{ code: STOCK }} />);

    expect(await screen.findByText(/^drew gantt/)).toBeTruthy();
  });

  it('hands a detected family the house engine cannot draw back to mermaid.js', async () => {
    const { container } = render(<Mermaid props={{ code: TOO_DEEP }} />);

    expect(await screen.findByText(/^drew flowchart/)).toBeTruthy();
    // The source dump is the house engine's last resort, not its answer where another engine is
    // still standing behind it — and the handoff brings exactly one rhythm wrapper, as ever.
    expect(container.querySelector('pre')).toBeNull();
    expect(container.querySelectorAll('.my-6')).toHaveLength(1);

    cleanup();

    render(<Mermaid props={{ code: UNPARSEABLE }} />);

    expect(await screen.findByText(/^drew flowchart/)).toBeTruthy();
  });

  it('carries exactly one flow rhythm wrapper down either path', () => {
    const house = render(<Mermaid props={{ code: HOUSE }} />);

    expect(house.container.querySelectorAll('.my-6')).toHaveLength(1);

    cleanup();

    const stock = render(<Mermaid props={{ code: STOCK }} />);

    expect(stock.container.querySelectorAll('.my-6')).toHaveLength(1);
  });
});

describe('MermaidFallback', () => {
  it('keeps the source visible next to the reason', () => {
    render(<MermaidFallback code="flowchart TD" message="This diagram couldn’t be drawn." />);

    expect(screen.getByText('This diagram couldn’t be drawn.')).toBeTruthy();
    expect(screen.getByText('flowchart TD')).toBeTruthy();
  });
});
