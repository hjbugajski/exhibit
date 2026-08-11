import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Diagram } from '@/components/diagram/diagram';
import type { DiagramClassNames, DiagramComponents } from '@/components/diagram/diagram-context';
import { useDiagramScene } from '@/components/diagram/diagram-context';
import { HouseDiagram } from '@/components/diagram/house-diagram';
import { useDiagram } from '@/components/diagram/use-diagram';
import { buildDiagram } from '@/lib/diagram/build';
import { round2 } from '@/lib/diagram/core/geometry/path';
import { metricsMeasurer } from '@/lib/diagram/core/text/measurers';
import { describeScene } from '@/lib/diagram/describe';

afterEach(() => {
  cleanup();
});

const FLOW = `flowchart TD
  A[Start] -->|yes| B{Choice}
  B --> C((Done))
  subgraph Group
    C
  end`;

const STATE = `stateDiagram-v2
  [*] --> Active
  Active --> [*]
  note right of Active: still running`;

const PIE = `pie showData title Sources
  "Direct" : 60
  "Search" : 40`;

function full(source: string) {
  return (
    <Diagram.Root source={source}>
      <Diagram.Title>Caption</Diagram.Title>
      <Diagram.Description />
      <Diagram.Svg />
      <Diagram.Legend />
      <Diagram.Issues />
    </Diagram.Root>
  );
}

function parts(container: HTMLElement, part: string) {
  return [...container.querySelectorAll(`[data-part="${part}"]`)];
}

describe('Diagram.Root', () => {
  it('marks the figure with the detected family, density and fit', () => {
    const { container } = render(full(FLOW));
    const figure = container.querySelector('[data-slot="diagram"]');

    expect(figure?.tagName).toBe('FIGURE');
    expect(figure?.getAttribute('data-diagram')).toBe('flowchart');
    expect(figure?.getAttribute('data-density')).toBe('comfortable');
    expect(figure?.getAttribute('data-fit')).toBe('scale');
  });

  it('writes the resolved typography metrics outward as custom properties', () => {
    const { container } = render(
      <Diagram.Root source={FLOW} metrics={{ fontSize: 17 }}>
        <Diagram.Svg />
      </Diagram.Root>,
    );
    const figure = container.querySelector<HTMLElement>('[data-slot="diagram"]');

    expect(figure?.style.getPropertyValue('--diagram-font-size')).toBe('17px');
    expect(figure?.style.getPropertyValue('--diagram-line-height')).toBe('1.4');
    expect(figure?.style.getPropertyValue('--diagram-font-family')).toContain('InterVariable');
  });

  it('writes every measured type role outward, not just the node size', () => {
    const { container } = render(
      <Diagram.Root
        source={FLOW}
        metrics={{ edgeLabelFontSize: 9, clusterTitleFontSize: 8, clusterTitleLetterSpacing: 0.5 }}
      >
        <Diagram.Svg />
      </Diagram.Root>,
    );
    const figure = container.querySelector<HTMLElement>('[data-slot="diagram"]');

    expect(figure?.style.getPropertyValue('--diagram-edge-font-size')).toBe('9px');
    expect(figure?.style.getPropertyValue('--diagram-cluster-label-font-size')).toBe('8px');
    expect(figure?.style.getPropertyValue('--diagram-cluster-label-letter-spacing')).toBe('0.5px');
  });

  /*
   * `fontWeight` and `fontFamily` flow outward to the renderer but the default measurer cannot read
   * them — it is one advance table for InterVariable at 400. The metrics and the DOM agree in that
   * case, so nothing on the page reveals it; the warning is the only signal.
   */
  it('warns when the metrics ask for type the default measurer cannot measure', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const boldMeasurer = {
      id: 'bold',
      measure: (text: string, style: { fontSize: number; lineHeight: number }) => ({
        width: text.length * style.fontSize * 0.6,
        height: style.fontSize * style.lineHeight,
      }),
    };

    render(
      <Diagram.Root source={FLOW} metrics={{ fontWeight: 600 }}>
        <Diagram.Svg />
      </Diagram.Root>,
    );

    expect(warn.mock.calls[0]?.[0]).toContain('InterVariable 400');
    warn.mockClear();
    cleanup();

    render(
      <Diagram.Root source={FLOW} metrics={{ fontFamily: 'Georgia, serif' }}>
        <Diagram.Svg />
      </Diagram.Root>,
    );

    expect(warn.mock.calls[0]?.[0]).toContain('Georgia 400');
    warn.mockClear();
    cleanup();

    // A caller who brought their own measurer has answered for the face themselves.
    render(
      <Diagram.Root source={FLOW} measurer={boldMeasurer} metrics={{ fontWeight: 600 }}>
        <Diagram.Svg />
      </Diagram.Root>,
    );
    render(
      <Diagram.Root source={FLOW}>
        <Diagram.Svg />
      </Diagram.Root>,
    );

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('honours a density preset by re-laying-out, not by CSS', () => {
    const { container: comfortable } = render(
      <Diagram.Root source={FLOW}>
        <Diagram.Svg />
      </Diagram.Root>,
    );
    const { container: compact } = render(
      <Diagram.Root source={FLOW} density="compact">
        <Diagram.Svg />
      </Diagram.Root>,
    );
    const boxOf = (root: HTMLElement) =>
      root.querySelector('[data-part="svg"]')?.getAttribute('viewBox');

    expect(boxOf(compact)).not.toBe(boxOf(comfortable));
  });

  it('draws at natural size for fit="scroll" and only a viewBox for fit="scale"', () => {
    const { container } = render(
      <Diagram.Root source={FLOW} fit="scroll" maxHeight={320}>
        <Diagram.Svg />
      </Diagram.Root>,
    );
    const svg = container.querySelector('[data-part="svg"]');
    const figure = container.querySelector<HTMLElement>('[data-slot="diagram"]');

    expect(figure?.getAttribute('data-fit')).toBe('scroll');
    expect(Number(svg?.getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(svg?.getAttribute('height'))).toBeGreaterThan(0);
    expect(figure?.style.getPropertyValue('--diagram-max-block-size')).toBe('320px');

    cleanup();

    const scaled = render(full(FLOW));

    expect(scaled.container.querySelector('[data-part="svg"]')?.hasAttribute('width')).toBe(false);
  });

  it('publishes the scene width so fit="scale" can shrink without ever upscaling', () => {
    const { container } = render(full(FLOW));
    const figure = container.querySelector<HTMLElement>('[data-slot="diagram"]');
    const viewBox = container.querySelector('[data-part="svg"]')?.getAttribute('viewBox');

    expect(figure?.style.getPropertyValue('--diagram-scene-inline-size')).toBe(
      `${viewBox?.split(' ')[2]}px`,
    );
  });

  it('omits the scene width when nothing could be drawn', () => {
    const { container } = render(
      <Diagram.Root source="gantt\n  title Release">
        <Diagram.Svg />
      </Diagram.Root>,
    );
    const figure = container.querySelector<HTMLElement>('[data-slot="diagram"]');

    expect(figure?.style.getPropertyValue('--diagram-scene-inline-size')).toBe('');
  });

  it('draws a hoisted useDiagram result, diagnostics included, without parsing its own source', () => {
    function Hoisted() {
      const diagram = useDiagram(`${FLOW}\n  style A fill:#f00`);

      return (
        <Diagram.Root diagram={diagram} source="nonsense that cannot parse">
          <Diagram.Svg />
          <Diagram.Issues />
        </Diagram.Root>
      );
    }

    const { container } = render(<Hoisted />);

    expect(parts(container, 'node')).toHaveLength(3);
    // The lossy half of the old `scene` prop: hoisting the hook used to silence every diagnostic.
    expect(parts(container, 'issue').map((issue) => issue.getAttribute('data-code'))).toContain(
      'unsupported-construct',
    );
  });

  it('reports diagnostics through onDiagnostics', () => {
    const onDiagnostics = vi.fn();

    render(
      <Diagram.Root
        source={'flowchart TD\n  style A fill:#f00\n  A --> B'}
        onDiagnostics={onDiagnostics}
      >
        <Diagram.Svg />
      </Diagram.Root>,
    );

    const reported = onDiagnostics.mock.calls.at(-1)?.[0] as { code: string }[];

    expect(reported.map((entry) => entry.code)).toContain('unsupported-construct');
  });

  it('throws a useful error when a part is used outside a root', () => {
    expect(() => render(<Diagram.Svg />)).toThrow(/inside <Diagram.Root>/);
  });
});

describe('graph parts', () => {
  it('emits a part, an id and author intent for every scene item', () => {
    const { container } = render(full(FLOW));

    expect(parts(container, 'node')).toHaveLength(3);
    expect(parts(container, 'node-shape')).toHaveLength(3);
    expect(parts(container, 'edge')).toHaveLength(2);
    expect(parts(container, 'edge-path')).toHaveLength(2);
    expect(parts(container, 'cluster')).toHaveLength(1);

    const shapes = parts(container, 'node').map((node) => node.getAttribute('data-shape'));

    expect(shapes).toEqual(expect.arrayContaining(['rect', 'diamond', 'circle']));

    const edge = parts(container, 'edge')[0];

    expect(edge?.getAttribute('data-source')).toBe('A');
    expect(edge?.getAttribute('data-target')).toBe('B');
    expect(edge?.getAttribute('data-line')).toBe('solid');
    expect(edge?.getAttribute('data-arrow')).toBe('arrow');
  });

  it('places nodes with the CSS transform property, translate only', () => {
    const { container } = render(full(FLOW));

    for (const node of parts(container, 'node')) {
      expect((node as unknown as HTMLElement).style.transform).toMatch(
        /^translate\(-?[\d.]+px, -?[\d.]+px\)$/,
      );
    }
  });

  it('draws each measured label line as its own tspan at an explicit baseline', () => {
    const { container } = render(full(FLOW));
    const label = parts(container, 'node-label')[0];

    expect(label?.getAttribute('text-anchor')).toBe('middle');
    expect(label?.querySelectorAll('tspan').length).toBeGreaterThan(0);
    expect(label?.querySelector('tspan')?.getAttribute('y')).toBeTruthy();
  });

  it('carries classDef names through as data-class and never their paint', () => {
    const { container } = render(
      full('flowchart TD\n  classDef hot fill:#f00,stroke:#900\n  A:::hot --> B'),
    );
    const node = container.querySelector('[data-id="A"]');

    expect(node?.getAttribute('data-class')).toBe('hot');
    expect(container.innerHTML).not.toContain('#f00');
  });

  it('tolerates the label-less state markers', () => {
    const { container } = render(full(STATE));
    const shapes = parts(container, 'node').map((node) => node.getAttribute('data-shape'));

    expect(shapes).toContain('state-start');
    expect(shapes).toContain('state-note');

    const marker = container.querySelector('[data-shape="state-start"]');

    expect(marker?.querySelector('[data-part="node-label"]')).toBeNull();
  });

  it('draws every label after the last stroke, with the stroke cut around it', () => {
    const { container } = render(full(FLOW));
    const svg = container.querySelector('[data-part="svg"]') as Element;
    const layers = [...svg.children].map((child) => child.getAttribute('data-part'));

    // A label another edge can be painted over is not a label, and a cluster title is exactly
    // where cross-boundary edges converge.
    expect(layers).toEqual(['clusters', 'edges', 'labels', 'nodes']);

    const label = container.querySelector('[data-part="edge-label"]');
    const stroke = container.querySelector('[data-part="edge-path"]');

    expect(label?.parentElement?.getAttribute('data-part')).toBe('labels');
    expect(stroke?.getAttribute('d')?.match(/M/g)).toHaveLength(2);

    // The plate is emitted but unmarked: nothing paints it unless the engine could not cut the gap.
    const plate = label?.querySelector('[data-part="edge-label-bg"]');

    expect(plate).not.toBeNull();
    expect(plate?.hasAttribute('data-plate')).toBe(false);

    const title = container.querySelector('[data-part="cluster-label"]');

    expect(title?.parentElement?.getAttribute('data-part')).toBe('labels');
    expect(title?.querySelector('[data-part="cluster-label-bg"]')).not.toBeNull();
    expect(title?.querySelector('[data-part="cluster-label-text"]')?.textContent).toBe('Group');
  });

  it('marks the plate on a label the stroke could not be cut around', () => {
    const { container } = render(
      <Diagram.Root metrics={{ rankSep: 16 }} source={'flowchart TD\n  A -->|a long label| B'}>
        <Diagram.Svg />
      </Diagram.Root>,
    );
    const plate = container.querySelector('[data-part="edge-label-bg"]');
    const stroke = container.querySelector('[data-part="edge-path"]');

    expect(stroke?.getAttribute('d')?.match(/M/g)).toHaveLength(1);
    expect(plate?.hasAttribute('data-plate')).toBe(true);
  });

  it('nests child clusters inside their parent group', () => {
    const { container } = render(
      full('flowchart TD\n  subgraph Outer\n    subgraph Inner\n      A --> B\n    end\n  end'),
    );
    const outer = container.querySelector('[data-part="cluster"][data-depth="0"]');

    expect(outer?.querySelector('[data-part="cluster"][data-depth="1"]')).not.toBeNull();
  });

  // Titles are drawn in the label layer, not inside their cluster, so the depth tint can only reach
  // them through their own attribute.
  it('carries the cluster depth onto the title in the label layer', () => {
    const { container } = render(
      full('flowchart TD\n  subgraph Outer\n    subgraph Inner\n      A --> B\n    end\n  end'),
    );
    const titles = parts(container, 'cluster-label');

    expect(titles.map((title) => title.getAttribute('data-depth'))).toEqual(['0', '1']);
  });
});

describe('pie parts', () => {
  it('renders slices by series index and a legend outside the drawing', () => {
    const { container } = render(full(PIE));
    const slices = parts(container, 'slice');

    expect(slices).toHaveLength(2);
    expect(slices[0]?.getAttribute('data-series')).toBe('0');
    expect(slices[1]?.getAttribute('data-series')).toBe('1');

    const items = parts(container, 'legend-item');

    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('Direct');
    expect(items[0]?.textContent).toContain('60%');
    expect(container.querySelector('[data-part="svg"] [data-part="legend"]')).toBeNull();
  });

  it('prints raw values when the source says showData', () => {
    const { container } = render(
      <Diagram.Root source={PIE}>
        <Diagram.Legend />
      </Diagram.Root>,
    );

    expect(parts(container, 'legend-item')[0]?.textContent).toContain('60 (60%)');
  });

  it('lets the showValues prop override the source', () => {
    const bare = render(
      <Diagram.Root source={PIE.replace('pie showData', 'pie')}>
        <Diagram.Legend />
      </Diagram.Root>,
    );
    const forced = render(
      <Diagram.Root source={PIE}>
        <Diagram.Legend showValues={false} />
      </Diagram.Root>,
    );

    expect(parts(bare.container, 'legend-item')[0]?.textContent).not.toContain('60 (60%)');
    expect(parts(forced.container, 'legend-item')[0]?.textContent).not.toContain('60 (60%)');
  });
});

describe('render stability', () => {
  it('leaves the drawing untouched when the parent re-renders', () => {
    let nodeRenders = 0;
    // Module-constant in real code; the point is that the identity is stable across parent renders.
    const components: DiagramComponents = {
      Node: ({ Default }) => {
        nodeRenders += 1;

        return <Default />;
      },
    };
    const onDiagnostics = vi.fn();

    function Parent() {
      const [tick, setTick] = useState(0);

      return (
        <>
          <button type="button" onClick={() => setTick(tick + 1)}>
            bump
          </button>
          <span data-testid="tick">{tick}</span>
          {/* Both objects are fresh literals every parent render, the way a call site writes them. */}
          <Diagram.Root
            classNames={{ node: 'n' }}
            components={components}
            source={FLOW}
            onDiagnostics={onDiagnostics}
          >
            <Diagram.Svg />
          </Diagram.Root>
        </>
      );
    }

    const { container } = render(<Parent />);
    const drawn = nodeRenders;
    const first = parts(container, 'node')[0];

    expect(drawn).toBe(3);
    expect(onDiagnostics).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('bump'));

    expect(screen.getByTestId('tick').textContent).toBe('1');
    // Not one node re-rendered, and the elements in the document are the same objects.
    expect(nodeRenders).toBe(drawn);
    expect(parts(container, 'node')[0]).toBe(first);
    // A latched callback is not re-invoked with diagnostics the consumer has already seen.
    expect(onDiagnostics).toHaveBeenCalledTimes(1);
  });

  it('updates the default subtree under an override instead of rebuilding it', () => {
    // Config changes, so every part *does* re-render — the point is that `<Default/>` keeps its
    // component identity, so React updates the existing elements rather than remounting them.
    const components: DiagramComponents = {
      Node: ({ Default }) => <Default />,
    };

    function Parent() {
      const [tick, setTick] = useState(0);

      return (
        <>
          <button type="button" onClick={() => setTick(tick + 1)}>
            bump
          </button>
          <Diagram.Root classNames={{ node: `n-${tick}` }} components={components} source={FLOW}>
            <Diagram.Svg />
          </Diagram.Root>
        </>
      );
    }

    const { container } = render(<Parent />);
    const shape = parts(container, 'node-shape')[0];

    fireEvent.click(screen.getByText('bump'));

    expect(parts(container, 'node')[0]?.getAttribute('class')).toContain('n-1');
    expect(parts(container, 'node-shape')[0]).toBe(shape);
  });
});

/** The shape every binding's failure UI has: no scene, so show what the author wrote. */
function SourceFallback() {
  const { scene, source } = useDiagramScene();

  return scene ? null : <pre>{source}</pre>;
}

describe('the render boundary', () => {
  it('turns a throwing override into a diagnostic and no drawing', () => {
    const components: DiagramComponents = {
      Node: () => {
        throw new Error('override exploded');
      },
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <Diagram.Root components={components} source={FLOW}>
        <Diagram.Svg />
        <Diagram.Issues />
      </Diagram.Root>,
    );

    expect(parts(container, 'svg')).toHaveLength(0);
    expect(parts(container, 'node')).toHaveLength(0);

    const issue = parts(container, 'issue').at(-1);

    expect(issue?.getAttribute('data-code')).toBe('internal-error');
    expect(issue?.getAttribute('data-severity')).toBe('error');
    expect(issue?.textContent).toContain('override exploded');
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });

  it('keeps the source on screen so the diagram degrades the way a parse failure does', () => {
    const components: DiagramComponents = {
      Node: () => {
        throw new Error('override exploded');
      },
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <Diagram.Root components={components} source={FLOW}>
        <Diagram.Svg />
        <SourceFallback />
      </Diagram.Root>,
    );

    expect(container.textContent).toContain('flowchart TD');

    logged.mockRestore();
  });

  it('tries again once the pipeline produces something new', () => {
    let explode = true;
    const components: DiagramComponents = {
      Node: ({ Default }) => {
        if (explode) {
          throw new Error('override exploded');
        }

        return <Default />;
      },
    };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container, rerender } = render(
      <Diagram.Root components={components} source={FLOW}>
        <Diagram.Svg />
      </Diagram.Root>,
    );

    expect(parts(container, 'node')).toHaveLength(0);

    explode = false;
    rerender(
      <Diagram.Root components={components} source={`${FLOW}\n  C --> D[Later]`}>
        <Diagram.Svg />
      </Diagram.Root>,
    );

    expect(parts(container, 'node')).toHaveLength(4);

    logged.mockRestore();
  });
});

describe('overrides', () => {
  it('applies the classNames slot map', () => {
    const classNames: DiagramClassNames = {
      root: 'root-x',
      svg: 'svg-x',
      node: 'node-x',
      nodeShape: 'shape-x',
      edge: 'edge-x',
    };
    const { container } = render(
      <Diagram.Root source={FLOW} classNames={classNames} className="extra">
        <Diagram.Svg />
      </Diagram.Root>,
    );

    expect(container.querySelector('[data-slot="diagram"]')?.className).toContain('root-x');
    expect(container.querySelector('[data-slot="diagram"]')?.className).toContain('extra');
    expect(container.querySelector('[data-part="svg"]')?.getAttribute('class')).toBe('svg-x');
    expect(parts(container, 'node')[0]?.getAttribute('class')).toBe('node-x');
    expect(parts(container, 'node-shape')[0]?.getAttribute('class')).toBe('shape-x');
    expect(parts(container, 'edge')[0]?.getAttribute('class')).toBe('edge-x');
  });

  it('uses a components.Node override and lets it wrap the default', () => {
    const components: DiagramComponents = {
      Node: ({ datum, Default }) => (
        <g data-custom={datum.id}>
          <Default />
        </g>
      ),
    };
    const { container } = render(
      <Diagram.Root source={FLOW} components={components}>
        <Diagram.Svg />
      </Diagram.Root>,
    );
    const wrapper = container.querySelector('[data-custom="A"]');

    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector('[data-part="node"]')).not.toBeNull();
    expect(wrapper?.querySelector('[data-part="node-shape"]')).not.toBeNull();
  });

  it('hands the override the props the default would have used', () => {
    const seen: string[] = [];
    const components: DiagramComponents = {
      Node: ({ defaultProps, Default }) => {
        seen.push(String(defaultProps['data-shape']));

        return <Default className="painted" />;
      },
    };
    const { container } = render(
      <Diagram.Root source={FLOW} components={components}>
        <Diagram.Svg />
      </Diagram.Root>,
    );

    expect(seen).toEqual(expect.arrayContaining(['rect', 'diamond']));
    expect(parts(container, 'node')[0]?.getAttribute('class')).toBe('painted');
  });

  it('routes state notes to components.Note before components.Node', () => {
    const components: DiagramComponents = {
      Note: ({ Default }) => (
        <g data-note="">
          <Default />
        </g>
      ),
    };
    const { container } = render(
      <Diagram.Root source={STATE} components={components}>
        <Diagram.Svg />
      </Diagram.Root>,
    );

    expect(container.querySelectorAll('[data-note]')).toHaveLength(1);
  });

  it('replaces the family view entirely when Svg is given children', () => {
    const { container } = render(
      <Diagram.Root source={FLOW}>
        <Diagram.Svg>
          <g data-part="mine" />
        </Diagram.Svg>
      </Diagram.Root>,
    );

    expect(parts(container, 'mine')).toHaveLength(1);
    expect(parts(container, 'node')).toHaveLength(0);
  });
});

describe('accessibility', () => {
  it('names the drawing with the summary and describes it with the sr-only structure', () => {
    const { container } = render(full(FLOW));
    const built = buildDiagram(FLOW, { measurer: metricsMeasurer });
    const expected = describeScene(built.scene as NonNullable<typeof built.scene>);
    const svg = container.querySelector('[data-part="svg"]');
    const description = container.querySelector('[data-part="description"]');

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe(expected.summary);
    expect(svg?.querySelector('title')).toBeNull();

    expect(description?.className).toContain('sr-only');
    expect(description?.querySelectorAll('li')).toHaveLength(expected.details.length);
    // The summary is the name; repeating it here would announce the diagram twice.
    expect(description?.textContent).not.toContain(expected.summary);
    expect(svg?.getAttribute('aria-describedby')).toBe(description?.id);
  });

  it('gives the caption and description ids derived from one generated id', () => {
    const { container } = render(full(FLOW));
    const title = container.querySelector('[data-part="title"]')?.id ?? '';
    const description = container.querySelector('[data-part="description"]')?.id ?? '';

    expect(title.endsWith('-title')).toBe(true);
    expect(description.endsWith('-description')).toBe(true);
    expect(title.slice(0, -'-title'.length)).toBe(description.slice(0, -'-description'.length));
  });

  it('prefers an explicit label over the summary', () => {
    const { container } = render(
      <Diagram.Root source={FLOW} label="Publish flow">
        <Diagram.Svg />
      </Diagram.Root>,
    );

    expect(container.querySelector('[data-part="svg"]')?.getAttribute('aria-label')).toBe(
      'Publish flow',
    );
  });
});

describe('diagnostics', () => {
  it('lists issues with their severity and code, and renders nothing when clean', () => {
    const { container } = render(full('flowchart TD\n  click A "https://x"\n  A --> B'));
    const issue = container.querySelector('[data-part="issue"]');

    expect(issue?.getAttribute('data-severity')).toBe('info');
    expect(issue?.getAttribute('data-code')).toBe('unsupported-construct');

    cleanup();

    const clean = render(full(FLOW));

    expect(clean.container.querySelector('[data-part="issues"]')).toBeNull();
  });

  it('puts what stopped the drawing first, then keeps source order', () => {
    const { container } = render(
      full(`flowchart TD
  click A "https://x"
  A --> B
  style B fill:#f00
  B -->`),
    );
    const issues = [...container.querySelectorAll('[data-part="issue"]')];

    expect(issues.map((issue) => issue.getAttribute('data-severity'))).toEqual([
      'error',
      'info',
      'info',
    ]);
    // Source order inside a severity: `click` is declared before `style`.
    expect(issues[1]?.textContent).toContain('Click');
    expect(issues[2]?.textContent).toContain("'style'");
  });
});

describe('HouseDiagram', () => {
  it('carries the catalog flow rhythm and an optional caption', () => {
    const { container } = render(<HouseDiagram source={FLOW} title="Publish flow" />);
    const figure = container.querySelector('[data-slot="diagram"]');

    expect(figure?.className).toContain('my-6');
    expect(figure?.className).toContain('first:mt-0');
    expect(screen.getByText('Publish flow').getAttribute('data-part')).toBe('title');
  });

  it('draws a title the source declared, and lets the prop override it', () => {
    const { container } = render(<HouseDiagram source={PIE} />);

    expect(container.querySelector('[data-part="title"]')?.textContent).toBe('Sources');

    cleanup();

    const overridden = render(<HouseDiagram source={PIE} title="Mine" />);

    expect(overridden.container.querySelector('[data-part="title"]')?.textContent).toBe('Mine');
  });

  it('leaves an accessibility-only title out of the drawing', () => {
    const { container } = render(
      <HouseDiagram source={'flowchart TD\n  accTitle: Only for readers\n  A --> B'} />,
    );

    expect(container.querySelector('[data-part="title"]')).toBeNull();
    expect(container.querySelector('[data-part="svg"]')?.getAttribute('aria-label')).toContain(
      'Only for readers',
    );
  });

  it('falls back to the source and the reason when nothing could be drawn', () => {
    const { container } = render(<HouseDiagram source={'not a diagram at all'} />);

    expect(container.querySelector('[data-part="svg"]')).toBeNull();
    expect(container.querySelector('pre')?.textContent).toContain('not a diagram at all');

    const issues = [...container.querySelectorAll('[data-part="issue"]')];

    // One channel for the reason: the issue list, which paints its own severity.
    expect(issues.map((issue) => issue.textContent)).toEqual([
      'No diagram type recognized on the first line.',
    ]);
    expect(issues[0]?.getAttribute('data-severity')).toBe('error');
  });

  /*
   * The highlighter is loaded lazily — it is ~5.5KB gzip that only a broken diagram needs. The
   * suspense fallback is a plain `<pre>` of the same source, so the text is on screen from the
   * first frame and on the server, where the chunk has not been fetched at all.
   */
  it('keeps the source on screen before the highlighter chunk arrives', () => {
    expect(renderToStaticMarkup(<HouseDiagram source={'not a diagram at all'} />)).toContain(
      'not a diagram at all',
    );
  });

  it('names a family it recognizes but does not draw', () => {
    const { container } = render(<HouseDiagram source={'gantt\n  section a'} />);
    const issue = container.querySelector('[data-part="issue"]');

    expect(issue?.getAttribute('data-code')).toBe('unsupported-diagram-type');
    expect(issue?.textContent).toContain('Gantt charts');
  });
});

describe('hydration safety', () => {
  it('draws identical geometry on two independent renders', () => {
    // The one generated id differs between two independent roots by design; everything else in the
    // drawing is geometry and must not.
    const drawing = (root: HTMLElement) =>
      root
        .querySelector('[data-part="svg"]')
        ?.outerHTML.replace(/aria-describedby="[^"]*"/, 'aria-describedby');
    const first = render(<HouseDiagram source={FLOW} />);
    const firstSvg = drawing(first.container);

    cleanup();

    const second = render(<HouseDiagram source={FLOW} />);

    expect(firstSvg).toBeTruthy();
    expect(drawing(second.container)).toBe(firstSvg);
  });

  it('draws the same geometry on the server as in the browser', () => {
    // The server has no document, so the measurer falls back to the metrics table. A divergence
    // here is a hydration mismatch in a published artifact, not a lazy chunk swap.
    const markup = renderToStaticMarkup(<HouseDiagram source={FLOW} />);
    const { container } = render(<HouseDiagram source={FLOW} />);
    const box = container.querySelector('[data-part="svg"]')?.getAttribute('viewBox');

    expect(box).toBeTruthy();
    expect(markup).toContain(`viewBox="${box}"`);
  });

  it('uses the deterministic measurer on the first render', () => {
    const { container } = render(
      <Diagram.Root source={FLOW} measurer={metricsMeasurer}>
        <Diagram.Svg />
      </Diagram.Root>,
    );
    const box = container.querySelector('[data-part="svg"]')?.getAttribute('viewBox');
    const built = buildDiagram(FLOW, { measurer: metricsMeasurer });
    const size = built.scene?.size as { width: number; height: number };

    expect(box).toBe(`0 0 ${round2(size.width)} ${round2(size.height)}`);
    // Every number in the DOM is rounded at emit, the scene size included.
    expect(box).toMatch(/^0 0 -?\d+(\.\d{1,2})? -?\d+(\.\d{1,2})?$/);
  });
});
