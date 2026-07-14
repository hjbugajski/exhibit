/**
 * Lazy shiki highlighter, fine-grained per the bundle discipline used for recharts/maplibre:
 * nothing here is imported statically except types, so the main chunk stays clean. The core +
 * engine load once on first highlight; each grammar is its own chunk, loaded only when a code
 * block actually uses that language. Everything runs client-side after mount — the server bundle
 * never ships grammars.
 *
 * Theming: a single theme (the strato port in shiki-theme.ts), so every token's color is
 * `var(--shiki-*)`. The variables are defined once in styles.css on top of the house hue scales,
 * which the dark block redeclares — so a scheme switch recolors code without re-tokenizing, and
 * shiki never sees a color value (no baked hexes, oklch works because the browser resolves the
 * var).
 */
import type { HighlighterCore, ThemedToken } from '@shikijs/core';

/**
 * Grammars capped to what Claude actually publishes. Each module bundles its embedded
 * dependencies (html includes javascript + css), so a single import is self-sufficient.
 */
const GRAMMARS = {
  bash: () => import('@shikijs/langs/bash'),
  css: () => import('@shikijs/langs/css'),
  html: () => import('@shikijs/langs/html'),
  javascript: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  jsx: () => import('@shikijs/langs/jsx'),
  markdown: () => import('@shikijs/langs/markdown'),
  python: () => import('@shikijs/langs/python'),
  tsx: () => import('@shikijs/langs/tsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  yaml: () => import('@shikijs/langs/yaml'),
};

export type HighlightLanguage = keyof typeof GRAMMARS;

/** The spellings Claude uses in `language` props for the grammars above. */
const ALIASES: Record<string, HighlightLanguage> = {
  cjs: 'javascript',
  js: 'javascript',
  md: 'markdown',
  mjs: 'javascript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  shellscript: 'bash',
  ts: 'typescript',
  yml: 'yaml',
  zsh: 'bash',
};

/** Must match `name` in shiki-theme.ts. */
const THEME_NAME = 'exhibit';

export function resolveHighlightLanguage(language: string | undefined): HighlightLanguage | null {
  if (!language) {
    return null;
  }

  const normalized = language.trim().toLowerCase();

  return normalized in GRAMMARS ? (normalized as HighlightLanguage) : (ALIASES[normalized] ?? null);
}

let highlighterPromise: Promise<HighlighterCore> | undefined;

function loadHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= Promise.all([
    import('@shikijs/core'),
    import('@shikijs/engine-javascript'),
    import('./shiki-theme'),
  ])
    .then(([core, engine, theme]) =>
      core.createHighlighterCore({
        engine: engine.createJavaScriptRegexEngine({ forgiving: true }),
        themes: [theme.shikiTheme],
        langs: [],
      }),
    )
    .catch((error: unknown) => {
      // Don't cache transient failures: this block stays plain, the next highlight retries.
      highlighterPromise = undefined;
      throw error;
    });

  return highlighterPromise;
}

export async function highlight(
  code: string,
  language: HighlightLanguage,
): Promise<ThemedToken[][]> {
  const highlighter = await loadHighlighter();

  if (!highlighter.getLoadedLanguages().includes(language)) {
    const grammar = await GRAMMARS[language]();
    await highlighter.loadLanguage(grammar.default);
  }

  return highlighter.codeToTokens(code, { lang: language, theme: THEME_NAME }).tokens;
}
