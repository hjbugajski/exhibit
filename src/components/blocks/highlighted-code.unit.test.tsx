// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { HighlightedCode } from '@/components/blocks/highlighted-code';

afterEach(() => {
  cleanup();
});

function renderCode(code: string, language?: string) {
  const { container } = render(<HighlightedCode code={code} language={language} />);
  const element = container.querySelector('pre');

  if (!element) {
    throw new Error('no <pre> rendered');
  }

  return element;
}

describe('HighlightedCode', () => {
  it('renders the source verbatim, newlines included', () => {
    const code = '{\n  "a": 1,\n  "b": [true, null]\n}\n';

    expect(renderCode(code, 'json').textContent).toBe(code);
  });

  it('highlights a known language', () => {
    const element = renderCode('{"a": 1}', 'json');

    expect(element.querySelectorAll('.th-token').length).toBeGreaterThan(0);
    expect(element.querySelector('.th-property')?.textContent).toBe('"a"');
  });

  it('renders plain for an unknown language', () => {
    expect(renderCode('a b c', 'cobol').querySelectorAll('.th-token')).toHaveLength(0);
  });

  it('skips highlighting past the size guard', () => {
    const code = `{"a": "${'x'.repeat(100_000)}"}`;
    const element = renderCode(code, 'json');

    expect(element.querySelectorAll('.th-token')).toHaveLength(0);
    expect(element.textContent).toBe(code);
  });
});
