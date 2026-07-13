// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useLocalStorageState } from '@/lib/use-local-storage-state';

type View = 'grid' | 'table';
const isView = (value: string): value is View => value === 'grid' || value === 'table';

afterEach(() => {
  window.localStorage.clear();
});

describe('useLocalStorageState', () => {
  // Note on "deterministic initial value": the hook's `useState(initialValue)` always starts at
  // `initialValue` by construction (the localStorage read only happens inside the mount effect) -
  // that's what makes it SSR-safe. `renderHook`/`act` flush effects synchronously though, so by the
  // time `result.current` is readable the sync effect below has already run; there's no way to
  // observe the pre-effect render from the outside here. The synchronous-initial-value guarantee is
  // a property of the source (`useState(initialValue)`, no localStorage read outside the effect),
  // not something this test harness can assert independently.

  it('syncs from localStorage after mount', async () => {
    window.localStorage.setItem('view', 'table');

    const { result } = renderHook(() => useLocalStorageState<View>('view', 'grid', isView));

    await waitFor(() => expect(result.current[0]).toBe('table'));
  });

  it('ignores an invalid stored value and keeps the initial value', async () => {
    window.localStorage.setItem('view', 'not-a-view');

    const { result } = renderHook(() => useLocalStorageState<View>('view', 'grid', isView));

    // Give any (incorrect) sync effect a chance to run before asserting it didn't.
    await Promise.resolve();
    expect(result.current[0]).toBe('grid');
  });

  it('leaves the initial value in place when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorageState<View>('view', 'grid', isView));

    expect(result.current[0]).toBe('grid');
  });

  it('writes through to localStorage and updates state when setValue is called', () => {
    const { result } = renderHook(() => useLocalStorageState<View>('view', 'grid', isView));

    act(() => {
      result.current[1]('table');
    });

    expect(result.current[0]).toBe('table');
    expect(window.localStorage.getItem('view')).toBe('table');
  });
});
