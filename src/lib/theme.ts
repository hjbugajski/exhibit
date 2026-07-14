/*
 * Appearance preference: 'system' follows the OS, 'light'/'dark' force a scheme. The resolved
 * scheme is stamped as `data-theme` on <html>; styles.css keys every dark token off
 * `:root[data-theme='dark']`, so the attribute is the single dark trigger. Client-safe module —
 * the only DOM access happens inside functions called from the browser.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'exhibit-theme';

/**
 * Pre-paint init: runs from an inline <head> script before the body renders, so a stored dark
 * preference never flashes light. Mirrors resolveTheme/getStoredThemePreference; the try/catch
 * covers storage being unavailable.
 */
export const THEME_INIT_SCRIPT = `(() => {
  let stored = null;
  try {
    stored = localStorage.getItem('${THEME_STORAGE_KEY}');
  } catch {}
  const dark = stored === 'dark' || (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();`;

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

/** Anything unexpected in storage (or nothing) reads as 'system'. */
export function getStoredThemePreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);

  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

/** Re-stamps <html> from the stored preference and the current OS scheme. */
export function applyStoredTheme(): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  document.documentElement.dataset.theme = resolveTheme(getStoredThemePreference(), systemDark);
}

export function setThemePreference(preference: ThemePreference): void {
  // 'system' is the default, so it is stored as absence — a fresh browser and an explicit
  // "System" pick behave identically.
  if (preference === 'system') {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } else {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  }
  applyStoredTheme();
}
