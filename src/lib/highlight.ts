/**
 * Synchronous highlighting on @tanstack/highlight: heuristic tokenizers cover every language
 * Claude publishes in a few KB, so tokens are produced during render — server included — rather
 * than loading a grammar and swapping markup in afterwards. Tokens carry semantic class names
 * only; the colors live in styles.css on the house scales, so a scheme switch recolors code
 * without re-tokenizing.
 */
import type { HighlightToken } from '@tanstack/highlight/core';
import { createHighlighter } from '@tanstack/highlight/core';
import { css } from '@tanstack/highlight/languages/css';
import { html } from '@tanstack/highlight/languages/html';
import { js } from '@tanstack/highlight/languages/js';
import { json } from '@tanstack/highlight/languages/json';
import { jsx } from '@tanstack/highlight/languages/jsx';
import { markdown } from '@tanstack/highlight/languages/markdown';
import { python } from '@tanstack/highlight/languages/python';
import { shell } from '@tanstack/highlight/languages/shell';
import { sql } from '@tanstack/highlight/languages/sql';
import { ts } from '@tanstack/highlight/languages/ts';
import { tsx } from '@tanstack/highlight/languages/tsx';
import { yaml } from '@tanstack/highlight/languages/yaml';

/** The names Claude publishes, mapped to the definitions whose own spellings differ. */
const LANGUAGES = {
  bash: shell,
  css,
  html,
  javascript: js,
  json,
  jsx,
  markdown,
  python,
  sql,
  tsx,
  typescript: ts,
  yaml,
};

export type HighlightLanguage = keyof typeof LANGUAGES;

/** The other spellings Claude uses in `language` props for the languages above. */
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

const highlighter = createHighlighter({ languages: Object.values(LANGUAGES) });

export function resolveHighlightLanguage(language: string | undefined): HighlightLanguage | null {
  if (!language) {
    return null;
  }

  const normalized = language.trim().toLowerCase();

  return normalized in LANGUAGES
    ? (normalized as HighlightLanguage)
    : (ALIASES[normalized] ?? null);
}

/**
 * Tokens grouped into lines, one entry per source line (a trailing newline yields a trailing empty
 * line), so joining every value with `\n` between lines reproduces `code` exactly. Tokenizers are
 * heuristic: anything they can't parse comes back as unclassed text, never an error.
 */
export function highlight(code: string, language: HighlightLanguage): Array<Array<HighlightToken>> {
  const { tokens } = highlighter.tokenize(code, { lang: LANGUAGES[language].name });
  let line: Array<HighlightToken> = [];
  const lines = [line];

  for (const token of tokens) {
    // Tokens are a flat run over the source and may span lines (block comments, plain text).
    for (const [index, part] of token.value.split('\n').entries()) {
      if (index > 0) {
        line = [];
        lines.push(line);
      }

      if (part) {
        line.push({ ...token, value: part });
      }
    }
  }

  return lines;
}
