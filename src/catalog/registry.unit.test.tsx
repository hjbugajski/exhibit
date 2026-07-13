// @vitest-environment happy-dom
import { createStateStore } from '@json-render/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { comparisonFixture } from '@/catalog/fixtures/comparison';
import { explainerFixture } from '@/catalog/fixtures/explainer';
import { itineraryFixture } from '@/catalog/fixtures/itinerary';
import { kitchenSinkFixture } from '@/catalog/fixtures/kitchen-sink';
import { SpecView } from '@/catalog/registry';

/**
 * maplibre-gl needs WebGL, which happy-dom lacks; the catalog Map is validated visually in the
 * browser instead.
 */
vi.mock('@/components/catalog/map', () => ({
  Map: () => <div data-testid="catalog-map" />,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Renderer with the catalog registry', () => {
  it('renders the itinerary fixture without console errors and shows key content', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<SpecView spec={itineraryFixture} />);

    expect(screen.getByText('Kyoto in Three Days')).toBeTruthy();
    expect(screen.getByText('Day 1 — Saturday')).toBeTruthy();
    expect(screen.getByText('Fushimi Inari Shrine')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders the explainer fixture without console errors and shows key content', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<SpecView spec={explainerFixture} />);

    expect(screen.getByText('How OAuth 2.1 Device Flow Works')).toBeTruthy();
    expect(screen.getByText('Request a device code')).toBeTruthy();
    expect(screen.getByText('What if the user never approves?')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders the comparison fixture without console errors and shows key content', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<SpecView spec={comparisonFixture} />);

    expect(screen.getByText('Plan Comparison')).toBeTruthy();
    expect(screen.getByText('Most popular')).toBeTruthy();
    expect(screen.getByText('Priority')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders the kitchen-sink fixture without console errors and shows key content', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<SpecView spec={kitchenSinkFixture} />);

    expect(screen.getByText('Kitchen Sink Replacement')).toBeTruthy();
    expect(screen.getByText('Parts List')).toBeTruthy();
    expect(screen.getByText('Licensed & insured')).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('Checklist state', () => {
  const spec = {
    root: 'cl',
    elements: {
      cl: {
        type: 'Checklist',
        props: {
          items: [
            { id: 'static', text: 'Static item', checked: true },
            { id: 'interactive', text: 'Interactive item', statePath: '/tasks/interactive' },
          ],
        },
        children: [],
      },
    },
  };

  it('writes a toggled statePath item into the store; static items stay disabled', async () => {
    const user = userEvent.setup();
    const store = createStateStore({});

    render(<SpecView spec={spec} store={store} />);

    const [staticBox, statefulBox] = screen.getAllByRole('checkbox');

    // Base UI renders disabled as data-disabled on the checkbox button.
    expect(staticBox?.hasAttribute('data-disabled')).toBe(true);
    expect(statefulBox?.hasAttribute('data-disabled')).toBe(false);

    // userEvent, not fireEvent: a bare synthetic click makes happy-dom forward label activation to
    // Base UI's hidden native input mid-bubble (before React can preventDefault), double-toggling
    // the checkbox.
    await user.click(statefulBox as HTMLElement);

    expect(store.getSnapshot()).toEqual({ tasks: { interactive: true } });
  });

  it('prefers saved state over the spec default', () => {
    const store = createStateStore({ tasks: { interactive: true } });

    render(<SpecView spec={spec} store={store} />);

    const [, statefulBox] = screen.getAllByRole('checkbox');

    expect(statefulBox?.getAttribute('aria-checked')).toBe('true');
  });
});

describe('Choice, NoteBox, and Rating state', () => {
  function singleElementSpec(type: string, props: Record<string, unknown>) {
    return { root: 'el', elements: { el: { type, props, children: [] } } };
  }

  it('stores the selected Choice option id', () => {
    const store = createStateStore({});

    render(
      <SpecView
        spec={singleElementSpec('Choice', {
          label: 'Pick one',
          options: [
            { id: 'alpha', label: 'Alpha' },
            { id: 'beta', label: 'Beta', description: 'detail' },
          ],
          statePath: '/decisions/pick',
        })}
        store={store}
      />,
    );

    fireEvent.click(screen.getByText('Beta'));

    expect(store.getSnapshot()).toEqual({ decisions: { pick: 'beta' } });
  });

  it('stores NoteBox text and prefers saved state', () => {
    const store = createStateStore({ feedback: { notes: 'saved earlier' } });

    render(
      <SpecView
        spec={singleElementSpec('NoteBox', { label: 'Notes', statePath: '/feedback/notes' })}
        store={store}
      />,
    );

    const textarea = screen.getByLabelText('Notes');

    expect((textarea as HTMLTextAreaElement).value).toBe('saved earlier');

    fireEvent.change(textarea, { target: { value: 'new text' } });

    expect(store.getSnapshot()).toEqual({ feedback: { notes: 'new text' } });
  });

  it('stores the Rating number and clears when the same star is clicked again', async () => {
    const user = userEvent.setup();
    const store = createStateStore({});

    render(
      <SpecView
        spec={singleElementSpec('Rating', { label: 'Draft 2', statePath: '/ratings/draft-2' })}
        store={store}
      />,
    );

    const fourStars = screen.getByRole('radio', { name: '4 of 5 stars' });

    // userEvent, not fireEvent — see the Checklist test above.
    await user.click(fourStars);

    expect(store.getSnapshot()).toEqual({ ratings: { 'draft-2': 4 } });

    await user.click(fourStars);

    expect(store.getSnapshot()).toEqual({ ratings: { 'draft-2': 0 } });
  });
});

describe('Prose security', () => {
  function proseSpec(markdown: string) {
    return {
      root: 'prose',
      elements: { prose: { type: 'Prose', props: { markdown }, children: [] } },
    };
  }

  it('strips raw HTML from markdown', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<SpecView spec={proseSpec('before <script>alert(1)</script> after')} />);

    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText(/before/)).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders a javascript: link as plain text, not an anchor', () => {
    render(<SpecView spec={proseSpec('[click me](javascript:alert(1))')} />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('click me')).toBeTruthy();
  });

  it('blocks an http:// image and allows an https:// image', () => {
    render(
      <SpecView
        spec={proseSpec(
          '![blocked](http://example.com/a.png)\n\n![allowed](https://example.com/b.png)',
        )}
      />,
    );

    const images = document.querySelectorAll('img');

    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute('src')).toBe('https://example.com/b.png');
  });

  it('renders an https:// link with rel=noopener noreferrer and target=_blank', () => {
    render(<SpecView spec={proseSpec('[docs](https://example.com/docs)')} />);

    const link = screen.getByRole('link', { name: 'docs' });

    expect(link.getAttribute('href')).toBe('https://example.com/docs');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});
