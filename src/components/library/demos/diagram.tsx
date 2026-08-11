/*
 * The diagram library showcase. Every section is one capability claim with the mermaid source next
 * to what it draws, so a regression is visible rather than argued about.
 *
 * Two panels are dev tooling rather than demonstration: the font-metrics generator prints the
 * `font-metrics-inter.ts` payload measured off the real loaded font, and the measurement audit
 * compares the shipped table against `getComputedTextLength` on the live drawing. Both need
 * browser APIs and degrade to a message where those are missing.
 */

import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { HighlightedCode } from '@/components/blocks/highlighted-code';
import { Diagram } from '@/components/diagram/diagram';
import type { DiagramRootProps } from '@/components/diagram/diagram';
import type { DiagramClassNames, DiagramComponents } from '@/components/diagram/diagram-context';
import { HouseDiagram } from '@/components/diagram/house-diagram';
import type { LibraryDemo } from '@/components/library/demo';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { round2 } from '@/lib/diagram/core/geometry/path';
import { defaultShapes } from '@/lib/diagram/core/shapes/registry';
import { interMetrics } from '@/lib/diagram/core/text/font-metrics-inter';
import { textStyle } from '@/lib/diagram/core/text/measure';
import { createSvgMeasurer, metricsMeasurer } from '@/lib/diagram/core/text/measurers';
import { defaultMetrics } from '@/lib/diagram/metrics';
import type { ShapeDef, ShapeRegistry } from '@/lib/diagram/types';
import { cn } from '@/lib/utils';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Custom properties are not in `CSSProperties`; every `--diagram-*` block goes through this. */
function vars(entries: Record<string, string>): CSSProperties {
  return entries as CSSProperties;
}

// -------------------------------------------------------------------------------------- sources

const sources = {
  directionTd: `flowchart TD
  Request[Request] --> Auth{Session?}
  Auth -- yes --> Render[Render page]
  Auth -- no --> SignIn[Sign in]`,

  directionLr: `flowchart LR
  Request[Request] --> Auth{Session?}
  Auth -- yes --> Render[Render page]
  Auth -- no --> SignIn[Sign in]`,

  shapes: `flowchart TD
  A[Rectangle] ~~~ B(Rounded) ~~~ C([Stadium]) ~~~ D[[Subroutine]]
  E[(Cylinder)] ~~~ F((Circle)) ~~~ G(((Double circle))) ~~~ H{Diamond}
  I{{Hexagon}} ~~~ J[/Parallelogram/] ~~~ K[\\Parallelogram alt\\] ~~~ L[/Trapezoid\\]
  M[\\Trapezoid alt/] ~~~ N>Asymmetric]`,

  edges: `flowchart LR
  A1[A] --> B1[solid arrow]
  A2[A] --- B2[solid, no cap]
  A3[A] -.-> B3[dotted arrow]
  A4[A] -.- B4[dotted, no cap]
  A5[A] ==> B5[thick arrow]
  A6[A] === B6[thick, no cap]
  A7[A] --o B7[circle cap]
  A8[A] --x B8[cross cap]
  A9[A] <--> B9[both ends]
  A10[A] -->|piped label| B10[labelled]
  A11[A] -- inline label --> B11[labelled]
  A12[A] ---> B12[longer: minLen 2]
  A13[A] ~~~ B13[invisible link]`,

  publish: `flowchart TD
  classDef danger fill:#ff0000
  classDef success fill:#00ff00

  Claude[Claude] -->|publish_spec| Endpoint

  subgraph server [Exhibit server]
    Endpoint[[MCP endpoint]] --> Token{Bearer token?}
    Token -- no --> Denied[401 unauthorized]:::danger
    Token -- yes --> Valid{Spec valid?}
    Valid -- no --> Errors[Validation errors]:::danger
    Valid -- yes --> Store[(SQLite)]

    subgraph publish [Publish path]
      Store --> Version[Version row]
      Version --> Card([Gallery card]):::success
    end
  end

  Denied --> Claude
  Errors --> Claude
  Card -->|artifact url| Claude`,

  state: `stateDiagram-v2
  [*] --> Draft
  Draft --> Review : submit
  note right of Draft : the author can still edit

  state Review {
    [*] --> Automated
    Automated --> Human : checks pass
    Human --> [*]
  }

  state Verdict <<choice>>
  Review --> Verdict
  Verdict --> Published : approved
  Verdict --> Draft : changes requested

  state Fanout <<fork>>
  Published --> Fanout
  Fanout --> Indexed
  Fanout --> Notified

  state Joined <<join>>
  Indexed --> Joined
  Notified --> Joined
  Joined --> [*]`,

  pie: `pie showData title Artifacts by kind
  "Markdown" : 128
  "Spec" : 64
  "HTML" : 32
  "Other" : 6`,

  badges: `flowchart LR
  Draft[Draft] --> Review[In review]:::hot
  Review --> Live[Live]:::hot`,

  shapeOverride: `flowchart LR
  Spec[Spec artifact] --> Render[Rendered page]
  Render --> Share[Shared link]`,

  reskin: `flowchart TD
  Source[Source] --> Parse[Parse]
  Parse --> Layout[Layout]
  Layout --> Scene[Scene]`,

  theme: `flowchart LR
  Publish[Publish] --> Valid{Valid?}
  Valid -- yes --> Gallery([Gallery])
  Valid -. no .-> Errors[Errors]`,

  recovery: `flowchart TD
  Ingest[Ingest] --> Validate[Validate]
  Validate -->
  Validate --> Store[(Store)]
  Store --> Serve([Serve])`,

  unsupported: `flowchart LR
  %%{init: {'theme':'forest'}}%%
  Author[Author] --> Review[Review]
  style Author fill:#ff0000
  linkStyle 0 stroke:#0000ff
  click Author "https://example.com"
  Review --> Publish[Publish]`,

  sequence: `sequenceDiagram
  autonumber
  actor Claude
  participant MCP as MCP endpoint
  participant Auth as Better Auth
  participant DB as SQLite

  Claude->>+MCP: publish_spec
  MCP->>+Auth: verify bearer token
  Auth-->>-MCP: token claims
  Note right of Auth: scope and subject only

  alt spec is valid
    MCP->>+DB: insert artifact version
    DB-->>-MCP: version id
    MCP-->>Claude: artifact url
  else validation failed
    MCP--xClaude: 400 with the errors
  end

  MCP->>MCP: prune old versions
  deactivate MCP`,

  gantt: `gantt
  title Release
  section Build
  Draft :a1, 2026-01-01, 3d
  Review :after a1, 2d`,

  audit: `flowchart LR
  Measure[Measure the label] -->|compare| Render[Render the label]
  Render --> Report[Report the error]`,
} as const;

// ------------------------------------------------------------------------------------- scaffold

function Story({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-medium">{title}</h2>
        <p className="text-foreground-muted text-sm">{note}</p>
      </div>
      {children}
    </section>
  );
}

/** One claim: the drawing on top, the exact source that produced it underneath. */
function Specimen({
  source,
  label,
  children,
  className,
}: {
  source: string;
  label?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      {label ? <p className="text-foreground-subtle text-xs font-medium">{label}</p> : null}
      <div className="bg-surface rounded-xl border p-4">
        {children ?? <HouseDiagram source={source} />}
      </div>
      <HighlightedCode
        className="bg-surface-muted overflow-x-auto rounded-lg p-3 text-xs leading-relaxed"
        code={source}
      />
    </div>
  );
}

/**
 * The full composition, unlike `HouseDiagram`, so a story can pass `components`, `shapes`,
 * `classNames` or an inline `--diagram-*` block. No `fit` override: `scale` shrinks and never grows,
 * so every drawing here — all of them narrower than the column — is at 1:1 and shows the type size
 * layout actually measured, which is what most of these stories are about.
 */
function Figure({ className, ...props }: DiagramRootProps) {
  return (
    <Diagram.Root className={cn('m-0', className)} {...props}>
      <Diagram.Description />
      <Diagram.Svg />
      <Diagram.Legend className="mt-3" />
      <Diagram.Issues className="text-foreground-muted mt-2 text-xs" />
    </Diagram.Root>
  );
}

// -------------------------------------------------------------------------------- composability

/** Paints inside the box the layout already reserved (C29) and delegates everything else. */
const badgeComponents: DiagramComponents = {
  NodeShape: ({ datum, Default }) =>
    datum.classes.includes('hot') ? (
      <>
        <Default />
        <circle
          className="[fill:var(--color-accent)]"
          cx={round2(datum.width / 2 - 8)}
          cy={round2(-datum.height / 2 + 8)}
          r={3}
        />
      </>
    ) : (
      <Default />
    ),
};

const FOLD = 10;

/** A folded-corner card. Size lives here, not in a component — that is the whole rule. */
const foldedCard: ShapeDef = {
  size: (label, m) => ({
    width: Math.max(m.minNodeWidth, label.width + m.nodePaddingX * 2 + FOLD),
    height: Math.max(m.minNodeHeight, label.height + m.nodePaddingY * 2),
  }),
  outline: (box) => {
    const w = round2(box.width / 2);
    const h = round2(box.height / 2);
    const foldX = round2(box.width / 2 - FOLD);
    const foldY = round2(-box.height / 2 + FOLD);

    return (
      `M${-w},${-h}L${foldX},${-h}L${w},${foldY}L${w},${h}L${-w},${h}Z` +
      `M${foldX},${-h}L${foldX},${foldY}L${w},${foldY}`
    );
  },
};

const cardShapes: ShapeRegistry = { ...defaultShapes, rect: foldedCard };

/**
 * Utilities land in Tailwind's `utilities` layer, which styles.css orders after `diagram.house` —
 * so a class on a part wins over the repo binding with no `!important` anywhere.
 */
const reskinClassNames: DiagramClassNames = {
  root: 'bg-surface-subtle rounded-xl border p-4',
  svg: 'mx-auto',
  nodeShape:
    '[--diagram-node-fill:var(--color-accent-subtle)] [--diagram-node-stroke:var(--color-accent)]',
  edgePath: '[--diagram-edge-stroke:var(--color-accent)]',
  edgeArrow: '[--diagram-arrow-fill:var(--color-accent)]',
};

// -------------------------------------------------------------------------------------- theming

/** Tier 0: every paint role back to `currentColor`/`transparent` — the unstyled honesty check. */
const tier0 = vars({
  '--diagram-node-fill': 'transparent',
  '--diagram-node-fill-hover': 'transparent',
  '--diagram-node-stroke': 'currentColor',
  '--diagram-node-text': 'currentColor',
  '--diagram-cluster-fill': 'transparent',
  '--diagram-cluster-fill-nested': 'transparent',
  '--diagram-cluster-stroke': 'currentColor',
  '--diagram-cluster-text': 'currentColor',
  '--diagram-cluster-label-fill': 'transparent',
  '--diagram-edge-stroke': 'currentColor',
  '--diagram-edge-text': 'currentColor',
  '--diagram-edge-label-fill': 'transparent',
  '--diagram-arrow-fill': 'currentColor',
  '--diagram-arrow-stroke': 'currentColor',
  '--diagram-arrow-open-fill': 'transparent',
  '--diagram-marker-fill': 'currentColor',
  '--diagram-note-fill': 'transparent',
  '--diagram-note-stroke': 'currentColor',
  '--diagram-note-text': 'currentColor',
  '--diagram-slice-stroke': 'currentColor',
  '--diagram-slice-text': 'currentColor',
  '--diagram-legend-text': 'currentColor',
  '--diagram-legend-value-text': 'currentColor',
  '--diagram-issue-text': 'currentColor',
  '--diagram-issue-error-text': 'currentColor',
  '--diagram-issue-warning-text': 'currentColor',
  '--diagram-issue-marker': 'currentColor',
  '--diagram-issue-code-text': 'currentColor',
});

/** A deliberately foreign skin: one block, no re-render, no re-layout. */
const blueprint = vars({
  '--diagram-node-fill': 'var(--color-background)',
  '--diagram-node-stroke': 'var(--color-info-line)',
  '--diagram-node-text': 'var(--color-info-body)',
  '--diagram-cluster-fill': 'transparent',
  '--diagram-cluster-fill-nested': 'transparent',
  '--diagram-cluster-stroke': 'var(--color-info-line)',
  '--diagram-cluster-text': 'var(--color-info)',
  '--diagram-edge-stroke': 'var(--color-info)',
  '--diagram-edge-text': 'var(--color-info)',
  '--diagram-edge-label-fill': 'var(--color-background)',
  '--diagram-arrow-fill': 'var(--color-info)',
  '--diagram-arrow-stroke': 'var(--color-info)',
  '--diagram-marker-fill': 'var(--color-info)',
});

// ---------------------------------------------------------------------- font-metrics generator

const GLYPH_FIRST = 0x20;
const GLYPH_LAST = 0x7e;

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function quote(text: string): string {
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

/**
 * Prints the `interMetrics` payload measured off the live document. The result is a paste-over of
 * the const in `core/text/font-metrics-inter.ts`; run `pnpm fmt` after pasting.
 *
 * Two things force an in-document SVG probe rather than a detached canvas. Inter 4 carries an
 * `opsz` axis, so an advance is a function of the rendered size — probing at 100px measures a
 * ~9% narrower face than the 13px the diagrams draw at. And the app asks for character variants
 * (`font-variant-alternates` on `html`), which a canvas context does not inherit. Probing at
 * `defaultMetrics.fontSize` inside `host` reproduces both.
 *
 * Advances are the whole payload. `ascent`/`descent` come from the font's hhea table, which no
 * browser measurement reports, so they are carried through unchanged rather than quietly replaced
 * with something else.
 */
function generateFontMetrics(host: HTMLElement): string | null {
  const svg = document.createElementNS(SVG_NS, 'svg');

  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.visibility = 'hidden';
  host.append(svg);

  try {
    const measurer = createSvgMeasurer(svg);
    const style = textStyle(defaultMetrics);
    const advances: string[] = [];

    for (let code = GLYPH_FIRST; code <= GLYPH_LAST; code += 1) {
      const char = String.fromCodePoint(code);
      const em = measurer.measure(char, style).width / style.fontSize;

      if (em <= 0) {
        return null;
      }

      advances.push(`    ${quote(char)}: ${round4(em)},`);
    }

    return [
      'export const interMetrics: FontMetrics = {',
      `  family: ${quote(interMetrics.family)},`,
      `  weight: ${style.fontWeight},`,
      `  unitsPerEm: ${interMetrics.unitsPerEm},`,
      `  ascent: ${interMetrics.ascent},`,
      `  descent: ${interMetrics.descent},`,
      '  advances: {',
      ...advances,
      '  },',
      `  fallback: { cjk: ${interMetrics.fallback.cjk}, combining: ${interMetrics.fallback.combining}, default: ${interMetrics.fallback.default} },`,
      '};',
    ].join('\n');
  } finally {
    svg.remove();
  }
}

function FontMetricsPanel() {
  const host = useRef<HTMLDivElement>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-col gap-3" ref={host}>
      <div className="flex items-center gap-3">
        <Button
          onClick={() => {
            const target = host.current;

            if (!target) {
              return;
            }

            try {
              const printed = generateFontMetrics(target);

              setFailed(printed === null);
              setOutput(printed);
            } catch {
              setFailed(true);
              setOutput(null);
            }
          }}
          variant="outline"
        >
          Measure InterVariable
        </Button>
        <p className="text-foreground-muted text-xs">
          U+0020–U+007E at {defaultMetrics.fontSize}px — the size diagrams draw at, which is what
          Inter&rsquo;s optical-size axis keys off — printed as the module payload. Measures
          whichever face is loaded right now, so run it once the page has settled.
        </p>
      </div>
      {failed ? (
        <p className="text-foreground-muted text-sm">
          No SVG text metrics in this environment, so nothing can be measured.
        </p>
      ) : null}
      {output ? (
        <HighlightedCode
          className="bg-surface-muted max-h-96 overflow-auto rounded-lg p-3 text-xs leading-relaxed"
          code={output}
          language="typescript"
        />
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------------------- measurement audit

interface AuditRow {
  text: string;
  table: number;
  rendered: number;
  error: number;
}

/**
 * Measures every rendered label twice — once from the shipped advance table, once through
 * `getComputedTextLength` on a throwaway probe in the same document — and returns the worst
 * disagreements. Anything past a couple of percent means the table needs regenerating.
 */
function runAudit(container: HTMLElement): AuditRow[] {
  const texts = new Set<string>();

  for (const node of container.querySelectorAll(
    '[data-part="node-label"] tspan, [data-part="edge-label-text"] tspan',
  )) {
    const text = node.textContent?.trim();

    if (text) {
      texts.add(text);
    }
  }

  const svg = document.createElementNS(SVG_NS, 'svg');

  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.visibility = 'hidden';
  container.append(svg);

  try {
    const measurer = createSvgMeasurer(svg);
    const style = textStyle(defaultMetrics);
    const rows: AuditRow[] = [];

    for (const text of texts) {
      const rendered = measurer.measure(text, style).width;

      if (rendered > 0) {
        const table = metricsMeasurer.measure(text, style).width;

        rows.push({ text, table, rendered, error: (table - rendered) / rendered });
      }
    }

    return rows.sort((a, b) => Math.abs(b.error) - Math.abs(a.error)).slice(0, 8);
  } finally {
    svg.remove();
  }
}

/** Draws the box the measurer promised behind the glyphs the browser actually laid out. */
const auditComponents: DiagramComponents = {
  NodeLabel: ({ datum, Default }) => (
    <>
      <rect
        className="[fill:none] [stroke:var(--color-accent)] [stroke-width:1] [stroke-dasharray:2_2]"
        height={round2(datum.label.height)}
        width={round2(datum.label.width)}
        x={round2(-datum.label.width / 2)}
        y={round2(-datum.label.height / 2)}
      />
      <Default />
    </>
  ),
};

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function AuditPanel() {
  const container = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState(false);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-surface rounded-xl border p-4" ref={container}>
        <Figure components={overlay ? auditComponents : undefined} source={sources.audit} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Field.Root className="w-auto flex-row items-center gap-2">
          <Checkbox checked={overlay} onCheckedChange={(checked) => setOverlay(checked === true)} />
          <Field.Label className="cursor-pointer">Show measured label boxes</Field.Label>
        </Field.Root>
        <Button
          onClick={() => {
            const target = container.current;

            if (!target) {
              return;
            }

            try {
              const measured = runAudit(target);

              setFailed(measured.length === 0);
              setRows(measured.length > 0 ? measured : null);
            } catch {
              setFailed(true);
              setRows(null);
            }
          }}
          variant="outline"
        >
          Run measurement audit
        </Button>
      </div>
      {failed ? (
        <p className="text-foreground-muted text-sm">
          This environment has no SVG text measurement, so the table cannot be checked here.
        </p>
      ) : null}
      {rows ? (
        <ul className="flex flex-col gap-1 font-mono text-xs">
          {rows.map((row) => (
            <li className="flex justify-between gap-4" key={row.text}>
              <span className="truncate">{row.text}</span>
              <span className="text-foreground-muted shrink-0">
                table {row.table.toFixed(1)} · rendered {row.rendered.toFixed(1)} ·{' '}
                {percent(row.error)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------------------------ the page

function DiagramDemo() {
  return (
    <div className="flex flex-col gap-12">
      <Story
        note="Direction is a header keyword; LR swaps the axes going into the engine rather than rotating the result, so labels stay upright and the graph never comes out cramped. Both draw at 1:1 here without asking for anything: the default fit shrinks a drawing that is wider than its column and never enlarges one that is narrower."
        title="Flowchart — direction"
      >
        <div className="grid gap-6">
          <Specimen label="TD" source={sources.directionTd} />
          <Specimen label="LR" source={sources.directionLr} />
        </div>
      </Story>

      <Story
        note="Every shape in the registry, selected by its delimiters. Each row is a chain of invisible links, which constrain layout without drawing anything."
        title="Flowchart — shapes"
      >
        <Specimen source={sources.shapes} />
      </Story>

      <Story
        note="Every link operator: line weight, both end caps, either direction, both label forms, and extra dashes asking for a longer span."
        title="Flowchart — links"
      >
        <Specimen source={sources.edges}>
          <HouseDiagram density="compact" fit="scroll" source={sources.edges} />
        </Specimen>
      </Story>

      <Story
        note={`This repo's publish path. Taller than the block-size cap, so it asks for fit="scroll" and keeps 13px type behind a scrollbar instead of being letterboxed down to fit. Nested subgraphs become nested clusters and are tinted a step further from the page; classDef and ::: keep the author's intent as data-class, and the declared hex is parsed and thrown away — the design system owns the paint.`}
        title="Flowchart — a real graph"
      >
        <Specimen source={sources.publish}>
          <HouseDiagram fit="scroll" source={sources.publish} title="Publishing an artifact" />
        </Specimen>
      </Story>

      <Story
        note="Composite states are clusters — the same recursion subgraphs use. Choice, fork and join are marker shapes; a note is a flagged node on a headless dotted edge."
        title="State"
      >
        <Specimen source={sources.state}>
          <HouseDiagram fit="scroll" source={sources.state} title="Artifact review" />
        </Specimen>
      </Story>

      <Story
        note={`This repo's OAuth publish path. Participants keep declaration order; the x pass packs them to their labels and then widens only the gaps a message, note or frame has to fit inside. Activation bars come from + / - and messages land on the bar edge rather than the lifeline. Autonumber is applied before measurement, so the counter is part of the width it asks for.`}
        title="Sequence"
      >
        <Specimen source={sources.sequence}>
          <HouseDiagram fit="scroll" source={sources.sequence} title="Publishing through MCP" />
        </Specimen>
      </Story>

      <Story
        note="Declaration order, sweeping from twelve o'clock. Centroid labels appear only where the measured text fits the slice; the rest fall back to the legend. The raw values come from the source's showData; Diagram.Legend takes a showValues prop to override it."
        title="Pie"
      >
        <Specimen source={sources.pie}>
          <Diagram.Root source={sources.pie}>
            <Diagram.Description />
            <Diagram.Svg />
            <Diagram.Legend className="mt-3" />
            <Diagram.Title className="text-foreground-muted mt-3 text-sm">
              Artifacts by kind
            </Diagram.Title>
          </Diagram.Root>
        </Specimen>
      </Story>

      <Story
        note="Three override channels, cheapest first. Only a shape or a metric may change a node's size; a component override paints inside the box the layout already reserved, or the edges point at nothing."
        title="Composability"
      >
        <div className="grid gap-6">
          <Specimen
            label="components — a badge painted inside the reserved box, every other node delegated to Default"
            source={sources.badges}
          >
            <Figure components={badgeComponents} source={sources.badges} />
          </Specimen>
          <Specimen
            label="shapes — rect replaced by a folded card, so the label box grows with it"
            source={sources.shapeOverride}
          >
            <Figure shapes={cardShapes} source={sources.shapeOverride} />
          </Specimen>
          <Specimen
            label="classNames — utility classes on parts, winning over the house layer without !important"
            source={sources.reskin}
          >
            <Figure classNames={reskinClassNames} source={sources.reskin} />
          </Specimen>
        </div>
      </Story>

      <Story
        note="One source, three appearances, identical geometry. Nothing re-parses, re-lays-out or re-renders between them: paint is entirely custom properties on the figure."
        title="Theming"
      >
        <div className="grid gap-6">
          <Specimen label="House binding" source={sources.theme}>
            <Figure source={sources.theme} />
          </Specimen>
          <Specimen label="Tier 0 — no stylesheet at all" source={sources.theme}>
            <Figure source={sources.theme} style={tier0} />
          </Specimen>
          <Specimen label="A foreign skin — one block of custom properties" source={sources.theme}>
            <Figure source={sources.theme} style={blueprint} />
          </Specimen>
        </div>
      </Story>

      <Story
        note="Bad input never costs more than the line it is on. Recovery is per statement, unsupported constructs are named rather than ignored, and a diagram that cannot be drawn at all keeps its source on screen."
        title="Resilience"
      >
        <div className="grid gap-6">
          <Specimen label="One broken statement, four surviving ones" source={sources.recovery}>
            <HouseDiagram source={sources.recovery} />
          </Specimen>
          <Specimen
            label="Recognized but deliberately unsupported — reported, not silently dropped"
            source={sources.unsupported}
          >
            <HouseDiagram source={sources.unsupported} />
          </Specimen>
          {/* No `Specimen` here: the fallback *is* the source, and printing it twice would read as
              a bug in the fallback rather than a demonstration of it. */}
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-foreground-subtle text-xs font-medium">
              A recognized but deferred family falls back to its source
            </p>
            <div className="bg-surface rounded-xl border p-4">
              <HouseDiagram source={sources.gantt} />
            </div>
          </div>
        </div>
      </Story>

      <Story
        note="Dev-only. The generator prints the advance table from the real loaded font; the audit re-measures every drawn label through the browser and reports where the table disagrees."
        title="Measurement tooling"
      >
        <div className="flex flex-col gap-6">
          <FontMetricsPanel />
          <AuditPanel />
        </div>
      </Story>
    </div>
  );
}

export const diagramDemo: LibraryDemo = {
  slug: 'diagram',
  title: 'Diagram',
  description:
    'The mermaid-syntax diagram library: flowchart, sequence, state and pie, drawn by the in-repo layout engine with every paint decision left to the design system.',
  group: 'Examples',
  render: () => <DiagramDemo />,
};
