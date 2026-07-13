// @vitest-environment happy-dom
import { useState } from 'react';

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Artifact } from '@/database/repository';
import { makeArtifact } from '@testing/factories';
import { renderWithRouter } from '@testing/router';

vi.mock('@/lib/artifacts', () => ({
  updateArtifactMetadataFn: vi.fn(),
}));

const { updateArtifactMetadataFn } = await import('@/lib/artifacts');
const { EditArtifactDialog } = await import('@/components/artifacts/edit-artifact-dialog');

/** The dialog is controlled; this stands in for the menu item that opens it. */
function Harness({ artifact }: { artifact: Artifact }) {
  const [open, setOpen] = useState(true);

  return <EditArtifactDialog artifact={artifact} onOpenChange={setOpen} open={open} />;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(updateArtifactMetadataFn).mockReset();
});

describe('EditArtifactDialog', () => {
  it('saves trimmed fields and deduped tags, then closes the dialog', async () => {
    vi.mocked(updateArtifactMetadataFn).mockResolvedValue(makeArtifact());

    renderWithRouter(<Harness artifact={makeArtifact()} />);

    const titleInput = (await screen.findByLabelText('Title')) as HTMLInputElement;
    const tagsInput = screen.getByLabelText('Tags') as HTMLInputElement;

    fireEvent.change(titleInput, { target: { value: '  New Title  ' } });
    fireEvent.change(tagsInput, { target: { value: 'travel, travel, japan, ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateArtifactMetadataFn).toHaveBeenCalledWith({
        data: {
          id: 'fixture-id',
          title: 'New Title',
          description: 'A test description',
          tags: ['travel', 'japan'],
        },
      });
    });

    // The dialog closes on success — the form fields unmount.
    await waitFor(() => expect(screen.queryByLabelText('Title')).toBeNull());
  });

  it('sends a null description when cleared', async () => {
    vi.mocked(updateArtifactMetadataFn).mockResolvedValue(makeArtifact());

    renderWithRouter(<Harness artifact={makeArtifact()} />);
    fireEvent.change(await screen.findByLabelText('Description'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(updateArtifactMetadataFn).toHaveBeenCalledWith({
        data: {
          id: 'fixture-id',
          title: 'Kyoto Trip',
          description: null,
          tags: ['travel', 'japan'],
        },
      });
    });
  });

  it('blocks submit with an inline error when the title is cleared', async () => {
    renderWithRouter(<Harness artifact={makeArtifact()} />);
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Title is required.')).toBeTruthy();
    expect(updateArtifactMetadataFn).not.toHaveBeenCalled();
  });

  it('does not call the fn when cancel is clicked', async () => {
    renderWithRouter(<Harness artifact={makeArtifact()} />);
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Changed' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(updateArtifactMetadataFn).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByLabelText('Title')).toBeNull());
  });

  it('shows an error via FormStatus and keeps the dialog open when the save fails', async () => {
    vi.mocked(updateArtifactMetadataFn).mockRejectedValue(
      new Error('Artifact not found. It may have been deleted.'),
    );

    renderWithRouter(<Harness artifact={makeArtifact()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Artifact not found. It may have been deleted.')).toBeTruthy();
    expect(screen.getByLabelText('Title')).toBeTruthy();
  });
});
