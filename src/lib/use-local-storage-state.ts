import { useEffect, useRef, useState } from 'react';

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
    const stored = window.localStorage.getItem(key);

    if (stored !== null && isValidValueRef.current(stored)) {
      setStateValue(stored);
    }
  }, [key]);

  function setValue(next: T) {
    setStateValue(next);
    window.localStorage.setItem(key, next);
  }

  return [value, setValue];
}
