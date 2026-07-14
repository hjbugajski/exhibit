// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import {
  getStoredThemePreference,
  resolveTheme,
  setThemePreference,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from '@/lib/theme';

afterEach(() => {
  localStorage.clear();
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
  it('is executable and stamps the stored scheme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    new Function(THEME_INIT_SCRIPT)();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
