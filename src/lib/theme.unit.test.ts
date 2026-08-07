// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getStoredThemePreference,
  resolveTheme,
  setThemePreference,
  THEME_COLOR,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from '@/lib/theme';

/**
 * Pre-seeds the meta the init script otherwise creates — the shape of a subsequent page load,
 * where the tag persists from the previous run.
 */
function renderThemeColorMeta(): HTMLMetaElement {
  const meta = document.createElement('meta');

  meta.name = 'theme-color';
  meta.content = THEME_COLOR.light;
  document.head.append(meta);

  return meta;
}

afterEach(() => {
  localStorage.clear();
  document.head.replaceChildren();
  delete document.documentElement.dataset.theme;
});

describe('resolveTheme', () => {
  it.each([
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
    ['system', false, 'light'],
    ['system', true, 'dark'],
  ] as const)('%s + systemDark=%s → %s', (preference, systemDark, expected) => {
    expect(resolveTheme(preference, systemDark)).toBe(expected);
  });
});

describe('preference storage', () => {
  it('reads missing or garbage storage as system', () => {
    expect(getStoredThemePreference()).toBe('system');

    localStorage.setItem(THEME_STORAGE_KEY, 'neon');

    expect(getStoredThemePreference()).toBe('system');
  });

  it('persists an explicit scheme and stamps <html>', () => {
    setThemePreference('dark');

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('stores system as absence and re-stamps from the OS scheme', () => {
    setThemePreference('dark');
    setThemePreference('system');

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    // happy-dom's matchMedia never matches, so system resolves light here.
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('THEME_INIT_SCRIPT', () => {
  function runInitScript(): void {
    // Compiling the script is half the assertion: it proves the inlined pre-paint source parses.
    // oxlint-disable-next-line typescript/no-implied-eval
    new Function(THEME_INIT_SCRIPT)();
  }

  it('is executable and stamps the stored scheme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    runInitScript();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('creates the theme-color meta and paints it dark on a dark preference under a light OS', () => {
    // No meta exists on a fresh document: the script creates it (React must never render this tag
    // — React 19 hoists metas and would insert a stale duplicate at hydration).
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    // happy-dom's matchMedia never matches, so the OS reads light here.
    runInitScript();

    const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');

    expect(metas).toHaveLength(1);
    expect(metas[0]?.content).toBe(THEME_COLOR.dark);
  });

  it('updates the existing meta instead of duplicating it', () => {
    const meta = renderThemeColorMeta();

    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    runInitScript();

    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
    expect(meta.content).toBe(THEME_COLOR.dark);
  });

  it('paints the browser chrome light on a light preference under a dark OS', () => {
    const meta = renderThemeColorMeta();

    meta.content = THEME_COLOR.dark;
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);

    runInitScript();

    expect(meta.content).toBe(THEME_COLOR.light);

    vi.restoreAllMocks();
  });
});

describe('theme-color meta', () => {
  it('follows the applied preference', () => {
    const meta = renderThemeColorMeta();

    setThemePreference('dark');

    expect(meta.content).toBe(THEME_COLOR.dark);

    setThemePreference('light');

    expect(meta.content).toBe(THEME_COLOR.light);
  });

  it('is optional — applying a preference without the meta present does not throw', () => {
    expect(() => setThemePreference('dark')).not.toThrow();
  });
});
