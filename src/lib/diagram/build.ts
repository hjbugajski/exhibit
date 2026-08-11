/*
 * The three public entry points. None of them throws: a family that blows up becomes an
 * `internal-error` diagnostic and a null scene, which is the single fatal signal the caller
 * renders a source fallback for.
 *
 * `buildDiagram` also owns option resolution — families and the layout engine always see a fully
 * resolved `LayoutOptions`, never a partial.
 */

import { Reporter } from './core/diagnostics.ts';
import { defaultShapes } from './core/shapes/registry.ts';
import { deferredFamily, detectFamily } from './detect.ts';
import { builtinFamilies, findFamily } from './family.ts';
import { resolveMetrics } from './metrics.ts';
import type {
  BuildOptions,
  BuildResult,
  Diagnostic,
  DiagramFamily,
  DiagramIR,
  DiagramLimits,
  LayoutOptions,
  LayoutResult,
  ParseOptions,
  ParseResult,
} from './types.ts';

export const defaultLimits: DiagramLimits = {
  chars: 20_000,
  nodes: 400,
  edges: 800,
  clusterDepth: 5,
  layoutNodes: 4000,
};

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Families report through `ctx.report` and return its array; a family that builds its own list gets
 * merged instead of duplicated.
 */
function merge(report: Reporter, diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  if (diagnostics !== report.diagnostics) {
    report.addAll(diagnostics);
  }

  return report.diagnostics;
}

export function parseDiagram(source: string, options: ParseOptions = {}): ParseResult {
  const report = new Reporter();
  const families = options.families ?? builtinFamilies;
  const limits = { ...defaultLimits, ...options.limits };

  if (source.length > limits.chars) {
    report.error(
      'source-too-large',
      `Diagram source is ${source.length} characters; the limit is ${limits.chars}.`,
    );

    return { ir: null, diagnostics: report.diagnostics };
  }

  const id = detectFamily(source, families);
  const family = id === null ? undefined : findFamily(families, id);

  if (!family) {
    const deferred = deferredFamily(source);

    if (deferred) {
      report.error(
        'unsupported-diagram-type',
        `${deferred} aren’t supported yet.`,
        undefined,
        families.map((entry) => entry.id),
      );
    } else {
      report.error(
        'unknown-diagram-type',
        'No diagram type recognized on the first line.',
        undefined,
        families.map((entry) => entry.id),
      );
    }

    return { ir: null, diagnostics: report.diagnostics };
  }

  try {
    const parsed = family.parse(source, { report, limits });

    return { ir: parsed.ir, diagnostics: merge(report, parsed.diagnostics) };
  } catch (cause) {
    report.error('internal-error', `The ${family.id} parser failed: ${messageOf(cause)}`);

    return { ir: null, diagnostics: report.diagnostics };
  }
}

export function layoutDiagram(
  ir: DiagramIR,
  options: LayoutOptions,
  families: readonly DiagramFamily[] = builtinFamilies,
): LayoutResult {
  const report = new Reporter();
  const family = findFamily(families, ir.kind);

  if (!family) {
    report.error('unknown-diagram-type', `No family registered for '${ir.kind}'.`);

    return { scene: null, diagnostics: report.diagnostics };
  }

  try {
    const laid = family.layout(ir, options);

    return { scene: laid.scene, diagnostics: merge(report, laid.diagnostics) };
  } catch (cause) {
    report.error('internal-error', `The ${family.id} layout failed: ${messageOf(cause)}`);

    return { scene: null, diagnostics: report.diagnostics };
  }
}

export function resolveLayoutOptions(options: BuildOptions): LayoutOptions {
  return {
    measurer: options.measurer,
    metrics: resolveMetrics(options.metrics, options.density),
    shapes: options.shapes ?? defaultShapes,
    edgeShape: options.edgeShape ?? 'ortho',
    clusters: options.clusters ?? 'recursive',
    orderSweeps: options.orderSweeps ?? 8,
    limits: { ...defaultLimits, ...options.limits },
  };
}

export function buildDiagram(source: string, options: BuildOptions): BuildResult {
  const families = options.families ?? builtinFamilies;
  const parsed = parseDiagram(source, { families, limits: options.limits });
  const family = detectFamily(source, families);

  if (!parsed.ir) {
    return { scene: null, diagnostics: parsed.diagnostics, family };
  }

  const laid = layoutDiagram(parsed.ir, resolveLayoutOptions(options), families);

  return {
    scene: laid.scene,
    diagnostics: [...parsed.diagnostics, ...laid.diagnostics],
    family,
  };
}
