import { useEffect, useId, useState } from 'react';

import mermaid, { type MermaidConfig } from 'mermaid';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { MermaidFallback } from '@/components/catalog/mermaid';
import {
  ALLOWED_FAMILIES,
  buildDiagramDocument,
  DIAGRAM_TYPE_LABELS,
  MERMAID_MAX_CHARS,
  MERMAID_MAX_EDGES,
  MERMAID_MAX_HEIGHT,
  MERMAID_SECURE_KEYS,
  parseDiagramAspectRatio,
  readThemeVariables,
  sanitizeDiagramSvg,
} from '@/components/catalog/mermaid-policy';
import { Skeleton } from '@/components/ui/skeleton';

type Props = CatalogComponentProps<'Mermaid'>;

interface Diagram {
  doc: string;
  title: string;
  aspectRatio: number | null;
}

/** A diagram the policy turned away; its message is the one the reader sees. */
class DiagramRejected extends Error {}

/** The app's theme script stamps the resolved scheme on <html>; that is the only source. */
function useDocumentTheme(): string {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light');

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.dataset.theme ?? 'light');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
}

/**
 * `securityLevel: 'strict'` is the floor, not the defense — it has contained few of mermaid's
 * advisories. What actually holds: `secure` locks the injection-capable keys against `%%{init}%%`
 * directives, `htmlLabels: false` keeps HTML out of the SVG entirely (the sanitizer drops
 * foreignObject, so HTML labels would render empty), the caps bound the known DoS classes, and
 * `suppressErrorRendering` makes a parse failure throw instead of injecting mermaid's error SVG.
 */
function buildConfig(themeVariables: Record<string, string>): MermaidConfig {
  return {
    securityLevel: 'strict',
    startOnLoad: false,
    suppressErrorRendering: true,
    htmlLabels: false,
    maxTextSize: MERMAID_MAX_CHARS,
    maxEdges: MERMAID_MAX_EDGES,
    theme: 'base',
    themeVariables,
    secure: MERMAID_SECURE_KEYS,
  };
}

function diagramTitle(code: string): string {
  try {
    return DIAGRAM_TYPE_LABELS.get(mermaid.detectType(code)) ?? '';
  } catch {
    // detectType throws UnknownDiagramError for anything it doesn't recognize.
    return '';
  }
}

export default function CatalogMermaidInner({ props }: { props: Props }) {
  const { code } = props;
  const theme = useDocumentTheme();
  // mermaid keys the styles it injects on the render id; a stable one keeps re-renders from
  // leaving a trail of orphaned style elements.
  const renderId = `mermaid-${useId().replaceAll(/[^A-Za-z0-9_-]/g, '')}`;
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function draw(): Promise<Diagram> {
      if (code.length > MERMAID_MAX_CHARS) {
        throw new DiagramRejected(
          `This diagram is longer than ${MERMAID_MAX_CHARS.toLocaleString()} characters.`,
        );
      }

      // initialize registers the diagram detectors, so it has to precede detectType — and the
      // config it applies is the one the render below runs under.
      const styles = getComputedStyle(document.documentElement);
      const themeVariables = readThemeVariables(styles);
      mermaid.initialize(buildConfig(themeVariables));

      const title = diagramTitle(code);

      if (!title) {
        throw new DiagramRejected(`Only ${ALLOWED_FAMILIES} diagrams render here.`);
      }

      const { svg } = await mermaid.render(renderId, code);
      const clean = sanitizeDiagramSvg(svg);

      return {
        doc: buildDiagramDocument(clean, themeVariables.background ?? 'transparent'),
        title,
        aspectRatio: parseDiagramAspectRatio(clean),
      };
    }

    setDiagram(null);
    setError(null);

    void (async () => {
      try {
        const next = await draw();

        if (!cancelled) {
          setDiagram(next);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof DiagramRejected ? cause.message : 'This diagram couldn’t be drawn.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, theme, renderId]);

  if (error) {
    return <MermaidFallback code={code} message={error} />;
  }

  if (!diagram) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <iframe
      className="w-full"
      sandbox=""
      srcDoc={diagram.doc}
      style={{
        aspectRatio: diagram.aspectRatio ?? undefined,
        height: diagram.aspectRatio ? undefined : '16rem',
        maxHeight: MERMAID_MAX_HEIGHT,
      }}
      title={diagram.title}
    />
  );
}
