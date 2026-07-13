// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocsView } from '@/components/docs/docs-view';
import { renderWithRouter } from '@testing/router';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const MCP_URL = 'https://exhibit.example.com/mcp';

const TOOL_NAMES = [
  'publish_spec',
  'publish_html',
  'get_catalog',
  'update_artifact',
  'list_artifacts',
  'list_tags',
  'get_artifact',
  'delete_artifact',
];

function renderDocs() {
  return renderWithRouter(<DocsView mcpUrl={MCP_URL} />, { extraPaths: ['/settings'] });
}

describe('DocsView', () => {
  it('renders the server URL and the Claude Code command', async () => {
    renderDocs();

    expect(await screen.findByText(MCP_URL)).toBeTruthy();
    expect(screen.getByText(`claude mcp add --transport http exhibit ${MCP_URL}`)).toBeTruthy();
  });

  it('lists every MCP tool', async () => {
    renderDocs();

    for (const tool of TOOL_NAMES) {
      expect(await screen.findByText(tool)).toBeTruthy();
    }
  });

  it('copies the server URL to the clipboard', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderDocs();

    fireEvent.click(await screen.findByRole('button', { name: 'Copy server URL' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(MCP_URL));
  });

  it('copies the Claude Code command to the clipboard', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderDocs();

    fireEvent.click(await screen.findByRole('button', { name: 'Copy Claude Code command' }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`claude mcp add --transport http exhibit ${MCP_URL}`),
    );
  });
});
