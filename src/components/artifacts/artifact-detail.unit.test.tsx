// @vitest-environment happy-dom
import { useState } from 'react';

import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ArtifactDetail } from '@/lib/artifacts';
import { makeArtifact, makeVersion } from '@testing/factories';
import { renderWithRouter } from '@testing/router';

/**
 * The server fns are the edge of this component; stubbing the module lets the interaction-state
 * pipeline (store -> debounce -> save) be driven and observed without a server. Every export the
 * rendered tree imports has to be present, including edit-artifact-dialog's.
 */
vi.mock('@/lib/artifacts', () => ({
  saveArtifactStateFn: vi.fn(() => Promise.resolve()),
  deleteArtifactFn: vi.fn(() => Promise.resolve()),
  setArtifactArchivedFn: vi.fn(() => Promise.resolve()),
  updateArtifactMetadataFn: vi.fn(() => Promise.resolve()),
}));

const { saveArtifactStateFn } = await import('@/lib/artifacts');
const { ArtifactDetailView } = await import('@/components/artifacts/artifact-detail');

/** Two interactive checklist items - the smallest spec that exercises a persisted statePath. */
const checklistSpec = {
  root: 'a',
  elements: {
    a: {
      type: 'Checklist',
      props: {
        items: [
          { id: 'i1', text: 'Order cabinets', statePath: '/tasks/cabinets' },
          { id: 'i2', text: 'Book the plumber', statePath: '/tasks/plumber' },
        ],
      },
      children: [],
    },
  },
};

function makeChecklistDetail(
  overrides: { version?: number; state?: ArtifactDetail['state'] } = {},
) {
  const version = overrides.version ?? 1;

  return {
    artifact: makeArtifact(),
    version: makeVersion({ version, body: JSON.stringify(checklistSpec) }),
    versions: Array.from({ length: version }, (_, index) => ({
      version: index + 1,
      createdAt: 1000 + index,
    })),
    state: overrides.state ?? null,
  } satisfies ArtifactDetail;
}

function renderDetail(detail: ArtifactDetail) {
  return renderWithRouter(<ArtifactDetailView detail={detail} id="fixture-id" />, {
    mountPath: '/a/$id',
    extraPaths: ['/', '/a/$id/v/$n'],
    initialEntry: '/a/fixture-id',
  });
}

/**
 * Clicks the item's text, not its checkbox: the checklist wraps both in a `<label>`, so a click on
 * the control itself also bubbles to the label and gets re-dispatched, toggling the item twice.
 * Clicking the text is the single, realistic activation (and is what a reader actually does).
 */
function toggle(name: string) {
  fireEvent.click(screen.getByText(name));
}

/**
 * Renders and waits for the router to mount the spec BEFORE switching to fake timers: Testing
 * Library's `findBy*` polls on real timers, so installing them any earlier makes the first query
 * hang until the test times out.
 */
async function mountChecklist(detail: ArtifactDetail) {
  renderDetail(detail);
  await screen.findByRole('checkbox', { name: 'Order cabinets' });
  vi.useFakeTimers();
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(saveArtifactStateFn).mockReset();
  vi.mocked(saveArtifactStateFn).mockResolvedValue(undefined as never);
});

describe('ArtifactDetailView', () => {
  it('renders SpecView inline for a valid spec fixture body', async () => {
    const detail: ArtifactDetail = {
      artifact: makeArtifact(),
      version: makeVersion(),
      versions: [{ version: 1, createdAt: 1000 }],
      state: null,
    };

    renderWithRouter(<ArtifactDetailView detail={detail} id="fixture-id" />, {
      mountPath: '/a/$id',
      extraPaths: ['/', '/a/$id/v/$n'],
      initialEntry: '/a/fixture-id',
    });

    expect(await screen.findByText('Kyoto in Three Days')).toBeTruthy();
    expect(screen.getByText('Day 1 — Saturday')).toBeTruthy();
  });

  it('lists all versions in the version dropdown, newest first, marking the latest and showing when each was created', async () => {
    const now = 1_000_000_000_000;

    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const detail: ArtifactDetail = {
      artifact: makeArtifact(),
      version: makeVersion({ version: 2 }),
      versions: [
        { version: 1, createdAt: now - 2 * 86_400_000 },
        { version: 2, createdAt: now - 3_600_000 },
      ],
      state: null,
    };

    renderWithRouter(<ArtifactDetailView detail={detail} id="fixture-id" />, {
      mountPath: '/a/$id',
      extraPaths: ['/', '/a/$id/v/$n'],
      initialEntry: '/a/fixture-id',
    });

    const trigger = await screen.findByRole('combobox', { name: 'Version' });

    expect(within(trigger).getByText('v2 (latest)')).toBeTruthy();

    fireEvent.click(trigger);
    const options = screen.getAllByRole('option').map((option) => option.textContent);

    expect(options).toEqual(['v2 (latest) · 1h ago', 'v1 · 2d ago']);
  });

  it('pretty-prints the spec body in the Source view', async () => {
    const spec = { root: 'a', elements: { a: { type: 'Prose', props: {}, children: [] } } };
    const detail: ArtifactDetail = {
      artifact: makeArtifact(),
      version: makeVersion({ body: JSON.stringify(spec) }),
      versions: [{ version: 1, createdAt: 1000 }],
      state: null,
    };

    renderWithRouter(<ArtifactDetailView detail={detail} id="fixture-id" />, {
      mountPath: '/a/$id',
      extraPaths: ['/', '/a/$id/v/$n'],
      initialEntry: '/a/fixture-id',
    });

    fireEvent.click(await screen.findByRole('tab', { name: 'Source' }));

    // getByText normalizes whitespace, which would collapse the pretty-print formatting we're
    // asserting on - compare raw textContent instead.
    expect(document.querySelector('code')?.textContent).toBe(JSON.stringify(spec, null, 2));
  });

  it('links an html artifact to its /render/:id/:n page in a new tab and shows the source, never embedding it', async () => {
    const detail: ArtifactDetail = {
      artifact: makeArtifact({ type: 'html' }),
      version: makeVersion({ body: '<html><body>hi</body></html>' }),
      versions: [{ version: 1, createdAt: 1000 }],
      state: null,
    };

    renderWithRouter(<ArtifactDetailView detail={detail} id="fixture-id" />, {
      mountPath: '/a/$id',
      extraPaths: ['/', '/a/$id/v/$n'],
      initialEntry: '/a/fixture-id',
    });

    // Base UI's Button with nativeButton={false} renders the anchor with role="button", so query by
    // its text instead of the link role.
    const open = (await screen.findByText('Open')).closest('a');

    expect(open?.getAttribute('href')).toBe('/render/fixture-id/1');
    expect(open?.getAttribute('target')).toBe('_blank');
    expect(open?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('code')?.textContent).toBe('<html><body>hi</body></html>');
  });
});

describe('ArtifactDetailView interaction state', () => {
  it('coalesces rapid toggles into a single save of the final state', async () => {
    await mountChecklist(makeChecklistDetail());

    toggle('Order cabinets');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    toggle('Book the plumber');

    // Still inside the debounce window: nothing has been written yet.
    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(saveArtifactStateFn).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(saveArtifactStateFn).toHaveBeenCalledTimes(1);
    expect(saveArtifactStateFn).toHaveBeenCalledWith({
      data: { id: 'fixture-id', state: { tasks: { cabinets: true, plumber: true } } },
    });
  });

  it('flushes a still-debounced change when the view unmounts', async () => {
    await mountChecklist(makeChecklistDetail());

    toggle('Order cabinets');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(saveArtifactStateFn).not.toHaveBeenCalled();

    // Navigating away mid-debounce must not silently drop the owner's edit.
    cleanup();

    expect(saveArtifactStateFn).toHaveBeenCalledTimes(1);
    expect(saveArtifactStateFn).toHaveBeenCalledWith({
      data: { id: 'fixture-id', state: { tasks: { cabinets: true } } },
    });
  });

  it('tells the owner when a save fails', async () => {
    vi.mocked(saveArtifactStateFn).mockRejectedValue(new Error('offline'));
    await mountChecklist(makeChecklistDetail());

    toggle('Order cabinets');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.getByText('Could not save your changes. Try again.')).toBeTruthy();
  });

  it('reseeds the store from the new version when the version changes', async () => {
    let showVersion: ((detail: ArtifactDetail) => void) | undefined;

    function Harness({ initial }: { initial: ArtifactDetail }) {
      const [detail, setDetail] = useState(initial);

      showVersion = setDetail;

      return <ArtifactDetailView detail={detail} id="fixture-id" />;
    }

    renderWithRouter(
      <Harness initial={makeChecklistDetail({ state: { tasks: { cabinets: true } } })} />,
      {
        mountPath: '/a/$id',
        extraPaths: ['/', '/a/$id/v/$n'],
        initialEntry: '/a/fixture-id',
      },
    );

    const checkbox = await screen.findByRole('checkbox', { name: 'Order cabinets' });

    expect(checkbox.getAttribute('aria-checked')).toBe('true');

    // The route keys this component by artifact id but not by version, so without the reseed the
    // previous version's interaction state would render (and debounce-save) against a spec it was
    // never recorded for.
    act(() => {
      showVersion?.(makeChecklistDetail({ version: 2, state: { tasks: { cabinets: false } } }));
    });

    expect(
      screen.getByRole('checkbox', { name: 'Order cabinets' }).getAttribute('aria-checked'),
    ).toBe('false');
  });
});
