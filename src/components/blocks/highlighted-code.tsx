import { Fragment, useEffect, useState } from 'react';

import type { ThemedToken } from '@shikijs/core';

import type { HighlightLanguage } from '@/lib/shiki';
import { highlight, resolveHighlightLanguage } from '@/lib/shiki';

interface Highlighted {
  code: string;
  lang: HighlightLanguage;
  tokens: ThemedToken[][];
}

/**
 * vscode-textmate FontStyle bitmask on ThemedToken (comments italicize, markdown gets
 * bold/italic/links/strikethrough; colors carry everything else).
 */
const ITALIC = 1;
const BOLD = 2;
const UNDERLINE = 4;
const STRIKETHROUGH = 8;

/**
 * `<pre>` with progressive shiki highlighting: plain code renders immediately (SSR, while the
 * shiki chunk loads, and on any failure) and tokens swap in when ready. Unknown or missing
 * languages never load shiki at all. Token colors are `var(--shiki-*)` references resolved by
 * styles.css, so they follow the scheme.
 */
export function HighlightedCode({
  code,
  language,
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  const lang = resolveHighlightLanguage(language);
  const [highlighted, setHighlighted] = useState<Highlighted | null>(null);

  useEffect(() => {
    if (!lang) {
      return;
    }

    let cancelled = false;

    highlight(code, lang)
      .then((tokens) => {
        if (!cancelled) {
          setHighlighted({ code, lang, tokens });
        }
      })
      .catch(() => {
        // Highlighting is enhancement only — stay plain.
      });

    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  // Guard against showing tokens from a previous code/language while the new ones load.
  const tokens =
    highlighted && highlighted.code === code && highlighted.lang === lang
      ? highlighted.tokens
      : null;

  return (
    <pre className={className}>
      <code>
        {tokens
          ? tokens.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {line.map((token, tokenIndex) => {
                  // -1 means NotSet in the bitmask — treat like None.
                  const fontStyle = token.fontStyle && token.fontStyle > 0 ? token.fontStyle : 0;

                  return (
                    <span
                      key={tokenIndex}
                      style={{
                        color: token.color,
                        fontStyle: fontStyle & ITALIC ? 'italic' : undefined,
                        fontWeight: fontStyle & BOLD ? 'bold' : undefined,
                        textDecoration:
                          fontStyle & (UNDERLINE | STRIKETHROUGH)
                            ? [
                                fontStyle & UNDERLINE ? 'underline' : '',
                                fontStyle & STRIKETHROUGH ? 'line-through' : '',
                              ]
                                .join(' ')
                                .trim()
                            : undefined,
                      }}
                    >
                      {token.content}
                    </span>
                  );
                })}
                {/* Separator, not terminator: shiki's line split has no trailing entry, so a
                    newline after the last line would add a blank line the plain fallback lacks. */}
                {lineIndex < tokens.length - 1 ? '\n' : null}
              </Fragment>
            ))
          : code}
      </code>
    </pre>
  );
}
