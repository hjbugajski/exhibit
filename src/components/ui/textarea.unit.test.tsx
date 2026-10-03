// @vitest-environment happy-dom
import { createRef } from 'react';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

afterEach(cleanup);

describe('Textarea', () => {
  it('keeps a caller id so the Field label points at it', () => {
    render(
      <Field.Root>
        <Field.Label>Notes</Field.Label>
        <Textarea id="notes-custom" />
      </Field.Root>,
    );

    expect(screen.getByText('Notes').getAttribute('for')).toBe('notes-custom');
    expect(screen.getByRole('textbox').id).toBe('notes-custom');
  });

  it('marks a disabled textarea with data-disabled', () => {
    render(<Textarea disabled />);

    expect(screen.getByRole('textbox').hasAttribute('data-disabled')).toBe(true);
  });

  it('forwards a ref to the textarea element', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });
});
