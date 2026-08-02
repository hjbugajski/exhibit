import { Fragment } from 'react';

import { highlight, resolveHighlightLanguage } from '@/lib/highlight';

/**
 * Bodies past this render plain: tokenizing an artifact (up to 1MB, see src/lib/mcp/limits.ts)
 * blocks the render pass, and a token span per word costs more than the highlighting is worth.
 * Compared against the string length — UTF-16 units, close enough for a guard.
 */
const HIGHLIGHT_MAX_BYTES = 100_000;

/**
 * `<pre>` with syntax highlighting. Tokenization is synchronous, so highlighted markup ships from
 * the server and there is no plain-text flash; unknown languages and oversized bodies render
 * plain. Token colors come from the `.th-*` rules in styles.css, so they follow the scheme.
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
  const lang = code.length > HIGHLIGHT_MAX_BYTES ? null : resolveHighlightLanguage(language);
  const lines = lang ? highlight(code, lang) : null;

  return (
    <pre className={className}>
      <code>
        {lines
          ? lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                <span className="th-line">
                  {line.map((token, tokenIndex) =>
                    token.className ? (
                      <span className={`th-token th-${token.className}`} key={tokenIndex}>
                        {token.value}
                      </span>
                    ) : (
                      token.value
                    ),
                  )}
                </span>
                {/* A real newline between lines, not a block break: it keeps the rendered text
                    identical to the source, so selections copy with their line breaks intact. */}
                {lineIndex < lines.length - 1 ? '\n' : null}
              </Fragment>
            ))
          : code}
      </code>
    </pre>
  );
}
