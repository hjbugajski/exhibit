/**
 * The parts of the mermaid pipeline that don't need mermaid itself: the caps, the diagram-type
 * allowlist, the theme-token map, and the two output steps (sanitize, then wrap in a document).
 * Deliberately free of the `mermaid` import so it stays cheap to test — and so the heavy lib keeps
 * exactly one import site (mermaid-inner.tsx).
 */
import DOMPurify from 'dompurify';

/** Mirrors the schema cap and the `maxTextSize` handed to mermaid. */
export const MERMAID_MAX_CHARS = 10_000;

export const MERMAID_MAX_EDGES = 200;

/** A tall diagram scrolls inside its frame instead of taking over the page. */
export const MERMAID_MAX_HEIGHT = '40rem';

/**
 * The app face (`--font-sans`), repeated here because the sandboxed frame document cannot read the
 * app's custom properties. mermaid lays the diagram out in the app document — where InterVariable
 * is live — so the frame must draw with the same face or every measured label width is wrong.
 */
export const MERMAID_FONT_FAMILY = 'InterVariable, sans-serif';

/** The upright face from public/fonts; the frame gets it as a data URI (see buildDiagramDocument). */
export const MERMAID_FONT_URL = '/fonts/InterVariable.woff2';

/**
 * `mermaid.detectType` returns internal ids, not the human names — several families answer to two
 * (`graph`/`flowchart` are v1 vs v2, `classDiagram-v2` reports `classDiagram`, and
 * `stateDiagram-v2` reports `stateDiagram` while plain `stateDiagram` reports `state`). Every id
 * here is pinned by mermaid-policy.unit.test.ts against the installed version, because a wrong
 * string silently widens or closes the allowlist. Render-time bugs are the residual risk in this
 * architecture, so the list stays at the stable families and widens only per request.
 */
export const DIAGRAM_TYPE_LABELS: ReadonlyMap<string, string> = new Map([
  ['flowchart', 'Flowchart'],
  ['flowchart-v2', 'Flowchart'],
  ['sequence', 'Sequence diagram'],
  ['class', 'Class diagram'],
  ['classDiagram', 'Class diagram'],
  ['state', 'State diagram'],
  ['stateDiagram', 'State diagram'],
  ['er', 'Entity relationship diagram'],
  ['gantt', 'Gantt chart'],
  ['pie', 'Pie chart'],
  ['journey', 'User journey'],
  ['gitGraph', 'Git graph'],
]);

/**
 * Human list for the rejection message, in the order Claude is told about them. The first four are
 * the families the house engine draws natively; leading with them is the only steer the catalog
 * budget affords (see catalog-summary.unit.test.ts — the summary sits ~7 tokens under its cap).
 */
export const ALLOWED_FAMILIES =
  'flowchart, state, sequence, pie, class, ER, gantt, journey and gitGraph';

/**
 * Keys a `%%{init}%%` directive inside the diagram source may not touch. The first six are
 * mermaid's own defaults (`defaultConfig.secure`, repeated because `initialize` replaces the array
 * rather than merging it); the rest close the surface the 2026 CSS/HTML injection advisories used —
 * theme CSS, HTML labels, the sanitizer config, fonts, and the renderer/layout switches.
 */
export const MERMAID_SECURE_KEYS = [
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'suppressErrorRendering',
  'maxEdges',
  'htmlLabels',
  'dompurifyConfig',
  'theme',
  'themeCSS',
  'themeVariables',
  'fontFamily',
  'altFontFamily',
  'layout',
  'look',
];

/**
 * mermaid's theme variables go through khroma, which cannot parse oklch (mermaid #6677), so the
 * house scales are mirrored as hex in the `--mermaid-*` custom properties — the one sanctioned hex
 * exception, resolved here at render time so the values still follow the scheme.
 */
export const MERMAID_THEME_TOKENS: Record<string, string> = {
  background: '--mermaid-background',
  primaryColor: '--mermaid-primary',
  primaryTextColor: '--mermaid-primary-text',
  primaryBorderColor: '--mermaid-primary-border',
  secondaryColor: '--mermaid-secondary',
  tertiaryColor: '--mermaid-tertiary',
  lineColor: '--mermaid-line',
  textColor: '--mermaid-text',
  /*
   * Gantt paint mermaid's base theme hardcodes to light-mode literals — `lightgrey` grid, a `white`
   * alternating section, `#eeeeee` excluded days, `lightgrey`/`grey` done tasks, `navy` vert
   * markers, `#003163` link labels — none of which derive from the variables above, so they arrive
   * unreadable on a dark canvas. Every other gantt color already resolves from primary/tertiary/text
   * and is left alone.
   */
  gridColor: '--mermaid-line',
  altSectionBkgColor: '--mermaid-secondary',
  excludeBkgColor: '--mermaid-secondary',
  doneTaskBkgColor: '--mermaid-secondary',
  doneTaskBorderColor: '--mermaid-primary-border',
  vertLineColor: '--mermaid-text',
  taskTextClickableColor: '--mermaid-text',
};

export function readThemeVariables(styles: CSSStyleDeclaration): Record<string, string> {
  const variables: Record<string, string> = {};

  for (const [name, token] of Object.entries(MERMAID_THEME_TOKENS)) {
    const value = styles.getPropertyValue(token).trim();

    if (value) {
      variables[name] = value;
    }
  }

  return variables;
}

/**
 * Second, independent pass over mermaid's output: the SVG profile drops every script-capable node
 * (script, event handlers, foreignObject and its contents, unknown protocols) while keeping the
 * diagram's own `<style>` element, which is presentational and inert once the document is framed.
 * mermaid runs with `htmlLabels: false` precisely because this profile removes foreignObject —
 * labels come back as SVG `<text>` instead of HTML inside the SVG.
 *
 * Throws rather than returning a best effort: a sanitizer that cannot run (no DOM) silently returns
 * its input, and that is the one failure mode this pass exists to prevent.
 */
export function sanitizeDiagramSvg(svg: string): string {
  if (!DOMPurify.isSupported) {
    throw new Error('DOMPurify is unavailable.');
  }

  const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });

  if (!clean.includes('<svg')) {
    throw new Error('Sanitizing left no diagram.');
  }

  return clean;
}

/**
 * The srcdoc for the display frame. The frame is rendered with `sandbox=""` — no scripts, opaque
 * origin — so the diagram's `<style>` cannot reach the app document (inline SVG `<style>` applies
 * document-wide, which is exactly what the 2026 advisories exploited). The meta CSP is the second
 * lock: nothing loads, styles are inline-only, images may only be data URIs.
 *
 * Both canvas colors are painted explicitly from resolved theme tokens, because an unstyled
 * sandboxed document assumes light mode twice over. The background: a document whose color-scheme
 * mismatches the embedding page gets an opaque white canvas instead of transparency, so
 * `transparent` reads as a white flash in dark mode. The foreground: d3's axis — the gantt's grid —
 * paints every tick line with a `stroke="currentColor"` presentation attribute that mermaid's
 * `.grid .tick` rule cannot override, so an unset `color` draws the grid in the UA's black.
 *
 * The app face rides along the same way, as a data URI — the opaque-origin frame can't pass the
 * CORS check a cross-origin font load requires, so `/fonts` is unreachable from inside it. Without
 * the face the frame falls back to a system font while the label widths were measured against
 * InterVariable in the app document. `font` is null when the fetch failed; the family stays
 * declared so the fallback is at least the app's `sans-serif`.
 *
 * The colors are computed custom-property values and the font is base64 the app fetched from its
 * own origin — none of it is diagram content, so interpolating is safe.
 */
export function buildDiagramDocument(
  svg: string,
  background: string,
  foreground: string,
  font: string | null,
): string {
  const fontFace = font
    ? `@font-face{font-family:InterVariable;font-weight:100 900;src:url(${font}) format('woff2')}`
    : '';

  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:">',
    `<style>${fontFace}html,body{margin:0;padding:0;background:${background};color:${foreground};font-family:${MERMAID_FONT_FAMILY}}svg{display:block;max-width:100%;height:auto}</style>`,
    `</head><body>${svg}</body></html>`,
  ].join('');
}

/**
 * Width over height, read off the SVG itself — mermaid reports the size it laid out, and no message
 * channel exists to ask the frame. `null` when neither a viewBox nor pixel dimensions are present.
 */
export function parseDiagramAspectRatio(svg: string): number | null {
  const viewBox = /viewBox=["']\s*[\d.+-]+\s+[\d.+-]+\s+([\d.]+)\s+([\d.]+)/i.exec(svg);

  if (viewBox) {
    return ratio(Number(viewBox[1]), Number(viewBox[2]));
  }

  const width = /\swidth=["']([\d.]+)(?:px)?["']/i.exec(svg);
  const height = /\sheight=["']([\d.]+)(?:px)?["']/i.exec(svg);

  return width && height ? ratio(Number(width[1]), Number(height[1])) : null;
}

function ratio(width: number, height: number): number | null {
  return width > 0 && height > 0 ? width / height : null;
}
