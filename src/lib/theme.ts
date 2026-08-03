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

/**
 * Anything unexpected in storage (or nothing) reads as 'system' — including storage throwing
 * outright, which it does when it is disabled (Safari private mode, blocked cookies).
 */
export function getStoredThemePreference(): ThemePreference {
  let stored: string | null = null;

  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return 'system';
  }

  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function applyTheme(preference: ThemePreference): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  document.documentElement.dataset.theme = resolveTheme(preference, systemDark);
}

/** Re-stamps <html> from the stored preference and the current OS scheme. */
export function applyStoredTheme(): void {
  applyTheme(getStoredThemePreference());
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    // 'system' is the default, so it is stored as absence — a fresh browser and an explicit
    // "System" pick behave identically.
    if (preference === 'system') {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Storage unavailable: the pick still applies for this session, it just won't persist.
  }

  // Stamp from the argument, not from storage — a failed write must not leave the page showing
  // the previous scheme while the picker reads as the new one.
  applyTheme(preference);
}
