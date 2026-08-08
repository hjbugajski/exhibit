import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * State backed by `localStorage`, SSR-safe: the hook always returns `initialValue` on the first
 * render (deterministic for SSR/hydration), then syncs from `localStorage` in an effect once
 * mounted. `setValue` writes through to `localStorage` immediately.
 */
export function useLocalStorageState<T extends string>(
  key: string,
  initialValue: T,
  isValidValue: (value: string) => value is T,
): [T, (value: T) => void] {
  const [value, setStateValue] = useState<T>(initialValue);
  const isValidValueRef = useRef(isValidValue);
  isValidValueRef.current = isValidValue;

  useEffect(() => {
    // Storage access throws outright when it is disabled (Safari private mode, blocked cookies);
    // the preference is a nicety, so every failure degrades to in-memory state.
    let stored: string | null = null;

    try {
      stored = window.localStorage.getItem(key);
    } catch {
      return;
    }

    if (stored !== null && isValidValueRef.current(stored)) {
      setStateValue(stored);
    }
  }, [key]);

  // Stable identity: consumers memoize action objects around it.
  const setValue = useCallback(
    (next: T) => {
      setStateValue(next);

      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Quota exceeded or storage disabled — the value still applies for this session.
      }
    },
    [key],
  );

  return [value, setValue];
}
