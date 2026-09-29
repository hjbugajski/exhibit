import type { createStateStore } from '@json-render/core';

type StateStoreFactory = typeof createStateStore;

let factoryPromise: Promise<StateStoreFactory> | undefined;
let factory: StateStoreFactory | undefined;

/**
 * Loads json-render's `createStateStore` on first call and memoizes it. The import is dynamic
 * because `@json-render/core` builds zod schemas at module scope and has no zod-free entry point,
 * and an html artifact never needs a store, so the detail route must not pull core in statically.
 */
export function loadStateStoreFactory(): Promise<StateStoreFactory> {
  factoryPromise ??= import('@json-render/core').then((module) => {
    factory = module.createStateStore;

    return factory;
  });

  return factoryPromise;
}

/**
 * The factory once `loadStateStoreFactory` has resolved, otherwise `undefined`. React's `use()`
 * suspends once on any promise it has not watched settle, even an already-resolved one, so a
 * caller reads this first to avoid a fallback flash after the loader already awaited the import.
 */
export function peekStateStoreFactory(): StateStoreFactory | undefined {
  return factory;
}
