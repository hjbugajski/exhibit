// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ArtifactDetail } from '@/lib/artifacts';
import { makeArtifact, makeVersion } from '@testing/factories';
import { renderWithRouter } from '@testing/router';

const { ArtifactDetailView } = await import('@/components/artifacts/artifact-detail');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
