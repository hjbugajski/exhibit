// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import type * as MapLibreGL from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';

import { usePopupInstance } from '@/components/ui/map/popup-utils';

type Listener = () => void;

function createStubPopup() {
  const listeners = new Map<string, Listener>();
  const off = vi.fn((event: string) => listeners.delete(event));
  const popup = {
    on: (event: string, listener: Listener) => listeners.set(event, listener),
    off,
    setOffset: () => undefined,
    setMaxWidth: () => undefined,
  } as unknown as MapLibreGL.Popup;

  return { popup, listeners, off };
}

describe('usePopupInstance', () => {
  it('attaches once and closes through the latest handler', () => {
    const { popup, listeners, off } = createStubPopup();
    const map = {} as MapLibreGL.Map;
    const teardown = vi.fn();
    const attach = vi.fn(() => teardown);
    const first = vi.fn();
    const second = vi.fn();

    const { rerender, unmount } = renderHook(
      ({ onClose }) =>
        usePopupInstance({
          map,
          offset: undefined,
          maxWidth: undefined,
          onClose,
          createPopup: () => popup,
          attach: () => attach(),
        }),
      { initialProps: { onClose: first } },
    );
    rerender({ onClose: second });

    expect(attach).toHaveBeenCalledOnce();

    listeners.get('close')?.();
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();

    unmount();
    expect(teardown).toHaveBeenCalledOnce();
    expect(off).toHaveBeenCalledWith('close', expect.any(Function));
  });
});
