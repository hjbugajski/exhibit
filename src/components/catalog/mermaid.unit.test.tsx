// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Mermaid } from '@/components/catalog/mermaid';

afterEach(cleanup);

const HOUSE = 'flowchart TD\n A --> B';
// Recognized, not drawn: the diagnostic has to name the family, not the header.
const DEFERRED = 'journey\n  title A day\n  section Publish\n  Write: 5: Claude';
// A header the engine claims over a body it cannot parse.
const UNPARSEABLE = 'flowchart TD\n A[oops\n B(oops';

describe('Mermaid', () => {
  it('draws a family the house engine knows, in the page and with no frame', () => {
    const { container } = render(<Mermaid props={{ code: HOUSE }} />);

    expect(container.querySelector('[data-part="svg"]')).toBeTruthy();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('pre')).toBeNull();
  });

  it('carries exactly one flow rhythm wrapper', () => {
    const { container } = render(<Mermaid props={{ code: HOUSE }} />);

    expect(container.querySelectorAll('.my-6')).toHaveLength(1);
  });

  it('keeps a deferred family’s source on screen under a diagnostic that names it', () => {
    const { container } = render(<Mermaid props={{ code: DEFERRED }} />);

    expect(container.querySelector('[data-part="svg"]')).toBeNull();
    expect(screen.getByText(/User-journey diagrams aren’t supported yet/)).toBeTruthy();
    expect(container.querySelector('pre')?.textContent).toContain('title A day');
  });

  it('degrades to the source when a claimed family cannot be drawn', () => {
    const { container } = render(<Mermaid props={{ code: UNPARSEABLE }} />);

    expect(container.querySelector('[data-part="svg"]')).toBeNull();
    expect(container.querySelector('pre')?.textContent).toContain('A[oops');
    expect(container.querySelectorAll('[data-part="issue"]').length).toBeGreaterThan(0);
  });

  it('renders hostile source as text, never as markup', () => {
    const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const { container } = render(<Mermaid props={{ code: hostile }} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('onerror');
  });
});
