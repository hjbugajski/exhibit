// @vitest-environment happy-dom
import { useEffect, useState } from 'react';

import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as StateStoreLoader from '@/components/artifacts/state-store-loader';
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
  revertArtifactVersionFn: vi.fn(() => Promise.resolve()),
  updateArtifactMetadataFn: vi.fn(() => Promise.resolve()),
}));

/** Spied, not stubbed: the store must still come from json-render's real factory. */
vi.mock('@/components/artifacts/state-store-loader', async (importOriginal) => {
  const actual = await importOriginal<typeof StateStoreLoader>();

  return {
    loadStateStoreFactory: vi.fn(actual.loadStateStoreFactory),
    peekStateStoreFactory: vi.fn(actual.peekStateStoreFactory),
  };
});

const { saveArtifactStateFn } = await import('@/lib/artifacts');
const { loadStateStoreFactory, peekStateStoreFactory } =
  await import('@/components/artifacts/state-store-loader');
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
    answers: { answered: 0, total: 2 },
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
  vi.mocked(peekStateStoreFactory).mockReset();
});

describe('ArtifactDetailView', () => {
  it('renders SpecView inline for a valid spec fixture body', async () => {
    const detail: ArtifactDetail = {
      artifact: makeArtifact(),
      version: makeVersion(),
      versions: [{ version: 1, createdAt: 1000 }],
      state: null,
      answers: { answered: 0, total: 0 },
    };

    renderWithRouter(<ArtifactDetailView detail={detail} id="fixture-id" />, {
      mountPath: '/a/$id',
      extraPaths: ['/', '/a/$id/v/$n'],
      initialEntry: '/a/fixture-id',
    });

    /*
     * The spec body sits behind SpecView's lazy chunk, which now evaluates the whole catalog —
     * diagram engine included. Under a loaded parallel suite that import can outlast the 1s
     * default, so the first lazy-content wait gets a real timeout, and the test a longer one.
     */
    expect(
      await screen.findByText('Kyoto in Three Days', undefined, { timeout: 10_000 }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Day 1 — Saturday' })).toBeTruthy();

    const panel = screen.getByRole('tabpanel');
    expect(screen.getByRole('tab', { name: 'Rendered' }).getAttribute('aria-controls')).toBe(
      panel.id,
    );
  }, 15_000);

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
      answers: { answered: 0, total: 0 },
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

  it('offers “Restore this version” only while an older version is on screen, and appends it as a new version', async () => {
    const { revertArtifactVersionFn } = await import('@/lib/artifacts');
    const versions = [
      { version: 1, createdAt: 1000 },
      { version: 2, createdAt: 2000 },
    ];

    function renderAt(version: number) {
      return renderWithRouter(
        <ArtifactDetailView
          detail={{
            artifact: makeArtifact(),
            version: makeVersion({ version }),
            versions,
            state: null,
            answers: { answered: 0, total: 0 },
          }}
          id="fixture-id"
        />,
        { mountPath: '/a/$id', extraPaths: ['/', '/a/$id/v/$n'], initialEntry: '/a/fixture-id' },
      );
    }

    renderAt(2);
    fireEvent.click(await screen.findByRole('button', { name: 'Artifact actions' }));

    expect(screen.queryByRole('menuitem', { name: 'Restore this version' })).toBeNull();

    cleanup();
    renderAt(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Artifact actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Restore this version' }));

    await vi.waitFor(() => {
      expect(revertArtifactVersionFn).toHaveBeenCalledWith({
        data: { id: 'fixture-id', version: 1 },
      });
    });
  });

  it('pretty-prints the spec body in the Source view', async () => {
    // A valid spec: Prose requires `markdown`, and the inline SpecView renders it before the Source
    // tab is clicked — an invalid element would crash into the error boundary and log.
    const spec = {
      root: 'a',
      elements: { a: { type: 'Prose', props: { markdown: 'Body copy.' }, children: [] } },
    };
    const detail: ArtifactDetail = {
      artifact: makeArtifact(),
      version: makeVersion({ body: JSON.stringify(spec) }),
      versions: [{ version: 1, createdAt: 1000 }],
      state: null,
      answers: { answered: 0, total: 0 },
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
      answers: { answered: 0, total: 0 },
    };

    renderWithRouter(<ArtifactDetailView detail={detail} id="fixture-id" />, {
      mountPath: '/a/$id',
      extraPaths: ['/', '/a/$id/v/$n'],
      initialEntry: '/a/fixture-id',
    });

    const open = await screen.findByRole('link', { name: 'Open' });

    expect(open.getAttribute('href')).toBe('/render/fixture-id/1');
    expect(open.getAttribute('target')).toBe('_blank');
    expect(open.getAttribute('rel')).toBe('noopener noreferrer');
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('code')?.textContent).toBe('<html><body>hi</body></html>');
  });

  it('never loads the state store factory for an html artifact', async () => {
    vi.mocked(loadStateStoreFactory).mockClear();
    renderDetail({
      artifact: makeArtifact({ type: 'html' }),
      version: makeVersion({ body: '<html><body>hi</body></html>' }),
      versions: [{ version: 1, createdAt: 1000 }],
      state: null,
      answers: { answered: 0, total: 0 },
    });

    await screen.findByText('Open');

    expect(loadStateStoreFactory).not.toHaveBeenCalled();
  });

  it('renders a markdown artifact inline, and shows its raw body in the Source view', async () => {
    const body = '# Trip notes\n\nBook the [train](https://example.com) first.\n';
    const detail: ArtifactDetail = {
      artifact: makeArtifact({ type: 'markdown' }),
      version: makeVersion({ body }),
      versions: [{ version: 1, createdAt: 1000 }],
      state: null,
      answers: { answered: 0, total: 0 },
    };

    renderDetail(detail);

    // Same lazy-chunk wait as the spec fixture above, for MarkdownView. The body's `#` ranks below
    // the page title.
    expect((await screen.findByText('Trip notes', undefined, { timeout: 10_000 })).tagName).toBe(
      'H2',
    );
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByText('train').closest('a')?.getAttribute('href')).toBe(
      'https://example.com',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));

    // Unlike a spec body, markdown is stored and shown byte-for-byte.
    expect(document.querySelector('code')?.textContent).toBe(body);
  });

  it('reports the answered count in the header when the body asks something', async () => {
    renderDetail({ ...makeChecklistDetail(), answers: { answered: 2, total: 3 } });

    expect(await screen.findByText('2 of 3 answered')).toBeTruthy();
  });

  it('renders no answered line at all for a body that asks nothing', async () => {
    renderDetail({ ...makeChecklistDetail(), answers: { answered: 0, total: 0 } });

    await screen.findByRole('checkbox', { name: 'Order cabinets' });

    expect(screen.queryByText(/answered/)).toBeNull();
  });
});

describe('ArtifactDetailView interaction state', () => {
  it('loads the state store factory for a spec artifact and saves a checklist toggle', async () => {
    // Earlier tests memoized the factory; hiding it forces the cold path, where the view suspends
    // on the load itself.
    vi.mocked(peekStateStoreFactory).mockReturnValue(undefined);
    vi.mocked(loadStateStoreFactory).mockClear();

    await mountChecklist(makeChecklistDetail());

    toggle('Order cabinets');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(loadStateStoreFactory).toHaveBeenCalled();
    expect(saveArtifactStateFn).toHaveBeenCalledWith({
      data: { id: 'fixture-id', state: { tasks: { cabinets: true } } },
    });
  });

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

    // Navigating away mid-debounce must not silently drop the owner's edit. Saves queue behind any
    // in-flight request, so the flush is dispatched on the next microtask rather than inline.
    await act(async () => {
      cleanup();
    });

    expect(saveArtifactStateFn).toHaveBeenCalledTimes(1);
    expect(saveArtifactStateFn).toHaveBeenCalledWith({
      data: { id: 'fixture-id', state: { tasks: { cabinets: true } } },
    });
  });

  it('saves a still-debounced change before switching versions', async () => {
    let resolveSave: (() => void) | undefined;

    vi.mocked(saveArtifactStateFn).mockImplementation(
      (() =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })) as never,
    );

    await mountChecklist(makeChecklistDetail({ version: 2 }));

    toggle('Order cabinets');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Version' }));

    // Base UI commits a mouse click on an item only after a pointerdown on that item.
    const v1 = screen.getByRole('option', { name: /^v1/ });

    fireEvent.pointerDown(v1);
    await act(async () => {
      fireEvent.click(v1);
    });

    // The next version's loader reads state, so the edit must land before the router navigates.
    expect(saveArtifactStateFn).toHaveBeenCalledWith({
      data: { id: 'fixture-id', state: { tasks: { cabinets: true } } },
    });
    expect(screen.getByRole('checkbox', { name: 'Order cabinets' })).toBeTruthy();

    vi.useRealTimers();
    await act(async () => {
      resolveSave?.();
    });

    await vi.waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: 'Order cabinets' })).toBeNull();
    });
  });

  it('holds a newer save until the in-flight one settles, so snapshots reach the server in order', async () => {
    const resolvers: (() => void)[] = [];

    vi.mocked(saveArtifactStateFn).mockImplementation(
      (() =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        })) as never,
    );

    await mountChecklist(makeChecklistDetail());

    toggle('Order cabinets');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(saveArtifactStateFn).toHaveBeenCalledTimes(1);

    // A second edit debounces out while the first request is still open. Firing it now would let
    // the two land in either order, and the server upsert replaces state wholesale.
    toggle('Book the plumber');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(saveArtifactStateFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0]?.();
    });

    expect(vi.mocked(saveArtifactStateFn).mock.calls.map(([arg]) => arg.data.state)).toEqual([
      { tasks: { cabinets: true } },
      { tasks: { cabinets: true, plumber: true } },
    ]);
  });

  it('tells the owner when a save fails', async () => {
    vi.mocked(saveArtifactStateFn).mockRejectedValue(new Error('offline'));
    await mountChecklist(makeChecklistDetail());

    toggle('Order cabinets');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.getByRole('alert').textContent).toBe('Your latest changes are not saved.');
  });

  it('clears the save error once a later save succeeds', async () => {
    vi.mocked(saveArtifactStateFn).mockRejectedValueOnce(new Error('offline'));
    await mountChecklist(makeChecklistDetail());

    toggle('Order cabinets');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole('alert')).toBeTruthy();

    toggle('Book the plumber');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(saveArtifactStateFn).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reseeds the store from the new version when the version changes', async () => {
    let showVersion: ((detail: ArtifactDetail) => void) | undefined;

    function Harness({ initial }: { initial: ArtifactDetail }) {
      const [detail, setDetail] = useState(initial);

      useEffect(() => {
        showVersion = setDetail;
      }, []);

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
