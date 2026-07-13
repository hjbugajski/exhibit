/**
 * Vitest setupFiles entry: runs before any test module loads, so these are in place before
 * src/database/index.ts / src/lib/auth.ts read them at import time. Individual suites (the two
 * heavy int tests, account.int.test.ts and artifacts.int.test.ts) override DATABASE_PATH with a
 * temp file before importing app code.
 */
process.env.DATABASE_PATH = ':memory:';
process.env.BETTER_AUTH_SECRET = 'test-secret-not-for-production-use';
process.env.BASE_URL = 'http://localhost:3000';

/**
 * Node 26 ships a lazy Web Storage `localStorage` global that resolves to `undefined` unless node
 * runs with `--localstorage-file`. Vitest's happy-dom environment doesn't override globals Node
 * already defines, so that stub shadows happy-dom's Storage in DOM suites — put a real one back.
 * Detected via the descriptor (Node's lazy global is an accessor): invoking the getter itself
 * emits an ExperimentalWarning per worker.
 */
if (
  typeof document !== 'undefined' &&
  Object.getOwnPropertyDescriptor(globalThis, 'localStorage')?.get !== undefined
) {
  const { Storage } = await import('happy-dom');

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    value: new Storage(),
  });
}
