import { useSyncExternalStore } from 'react';

const subscribeNever = () => () => {};

/**
 * False during SSR and hydration, true afterwards. `useSyncExternalStore` makes the flip a single
 * post-hydration render without an effect-driven setState.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}
