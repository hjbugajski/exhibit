/*
 * The flowchart parser: a line-oriented outer loop over `readLines`, recursive descent inside a
 * line over a shared `Scanner`.
 *
 * Recovery granularity is the logical line. A statement builds into a staging buffer and only
 * commits when it parses cleanly, so a half-parsed `A --> ` leaves no orphan node behind; the
 * `StatementError` unwinds to the driver, becomes one diagnostic, and the next line carries on.
 *
 * Constructs mermaid supports but this library deliberately does not — `%%{init}%%`, `style`,
 * `linkStyle`, `click`, `@{…}` metadata, markdown strings — are recognized, skipped, and reported
 * as `info` so the author is told what to change rather than silently ignored.
 */

import { StatementError, reportStatementError } from '../../core/diagnostics.ts';
import type { LogicalLine } from '../../core/lex/lines.ts';
import { readLines, splitHeader } from '../../core/lex/lines.ts';
import { Scanner } from '../../core/lex/scanner.ts';
import { readDelimited, readRestOfLine } from '../../core/lex/tokens.ts';
import type {
  ArrowKind,
  DiagnosticSink,
  LineKind,
  ParseContext,
  ParseResult,
  Span,
} from '../../types.ts';
import type {
  FlowCluster,
  FlowDirection,
  FlowEdge,
  FlowNode,
  FlowchartIR,
  LabelSource,
} from './ir.ts';
import { isMarkdownLabel, parseLabelText } from './ir.ts';

const DIRECTIONS: Readonly<Record<string, FlowDirection>> = {
  TB: 'TB',
  TD: 'TB',
  BT: 'BT',
  LR: 'LR',
  RL: 'RL',
};

interface ShapeGroup {
  open: string;
  closers: readonly { close: string; shape: string }[];
}

/**
 * Delimiter-to-shape table. Two rules resolve every ambiguity: the longest opener that matches wins
 * (`[[x]]` is a subroutine, not a rect holding `[x`), and within one opener the closer that ends
 * *earliest* wins (`A[/x\] --> B[\y/]` is two slanted nodes, not one label swallowing the line).
 */
const SHAPE_GROUPS: readonly ShapeGroup[] = [
  { open: '(((', closers: [{ close: ')))', shape: 'double-circle' }] },
  { open: '([', closers: [{ close: '])', shape: 'stadium' }] },
  { open: '((', closers: [{ close: '))', shape: 'circle' }] },
  { open: '[[', closers: [{ close: ']]', shape: 'subroutine' }] },
  { open: '[(', closers: [{ close: ')]', shape: 'cylinder' }] },
  {
    open: '[/',
    closers: [
      { close: '/]', shape: 'parallelogram' },
      { close: '\\]', shape: 'trapezoid' },
    ],
  },
  {
    open: '[\\',
    closers: [
      { close: '\\]', shape: 'parallelogram-alt' },
      { close: '/]', shape: 'trapezoid-alt' },
    ],
  },
  { open: '{{', closers: [{ close: '}}', shape: 'hexagon' }] },
  { open: '{', closers: [{ close: '}', shape: 'diamond' }] },
  { open: '[', closers: [{ close: ']', shape: 'rect' }] },
  { open: '(', closers: [{ close: ')', shape: 'round' }] },
  { open: '>', closers: [{ close: ']', shape: 'asymmetric' }] },
];

const SHAPE_OPENERS = new Set(['[', '(', '{', '>']);

/**
 * Node ids may contain hyphens (`my-node`), but a hyphen that starts a link must not be eaten —
 * `A-->B` is a link, `my-node-->B` is a link from `my-node`. The lookahead is what makes both work
 * without whitespace, which the shared `readIdent` cannot express.
 */
const FLOW_IDENT = /[\p{L}\p{N}_](?:[\p{L}\p{N}_.]|-(?![-.>]))*/u;

// ------------------------------------------------------------------------------------- links

interface LinkToken {
  line: LineKind;
  arrow: ArrowKind;
  startArrow: ArrowKind;
  minLen: number;
  label?: string;
  invisible: boolean;
}

const START_CAP = /[<ox](?=[-=])/;
const INVISIBLE = /~{3,}/;
/*
 * A labelled link opens with the *minimal* run (`--`, `==`, `-.`) and carries any extra length on
 * its closing run, so `A --- B` cannot be read as `A -- B --` and chains stay chains. Two guards do
 * the work: the opener may not be followed by an end cap (otherwise `A --> B --> C` reads as one
 * link labelled `> B`), and the label may not start with the link's own character (otherwise
 * `A ----- B` reads as a link labelled `-`).
 *
 * The label body (512) and the padding either side of it (64) are capped rather than left open. A
 * lazy body crossed with a re-scannable run of spaces makes a *failing* match quadratic in the
 * length of the line — a crafted 20 000-character link, well inside the source limit, blocked the
 * main thread for half a second. Both caps are far past any label that can be drawn, so the only
 * source they change is one that was already unrenderable, and it falls through to the usual
 * `unexpected-token` diagnostic.
 */
const DOTTED_LABEL = /-\.(?![-.>ox])[ \t]{0,64}(\S.{0,512}?)[ \t]{0,64}(\.+)-([>ox]?)/;
const DOTTED = /-(\.+)-([>ox]?)/;
const THICK_LABEL = /==(?![>ox])[ \t]{0,64}([^\s=].{0,512}?)[ \t]{0,64}(={2,})([>ox]?)/;
const THICK = /(={2,})([>ox]?)/;
const SOLID_LABEL = /--(?![>ox])[ \t]{0,64}([^\s-].{0,512}?)[ \t]{0,64}(-{2,})([>ox]?)/;
const SOLID = /(-{2,})([>ox]?)/;

const MAX_MIN_LEN = 4;

function clampLen(value: number): number {
  return Math.min(MAX_MIN_LEN, Math.max(1, value));
}

/** `>` heads a target-end cap, `<` a source-end one; `o` and `x` mean the same at either end. */
function capOf(text: string | undefined): ArrowKind {
  if (text === '>' || text === '<') {
    return 'arrow';
  }

  if (text === 'o') {
    return 'circle';
  }

  return text === 'x' ? 'cross' : 'none';
}

/** Dashes and equals carry length on the run itself; an end cap eats one of them. */
function runLength(run: string, cap: ArrowKind): number {
  return clampLen(run.length - (cap === 'none' ? 2 : 1));
}

function link(
  line: LineKind,
  minLen: number,
  arrow: ArrowKind,
  startArrow: ArrowKind,
  label?: string,
): LinkToken {
  const token: LinkToken = { line, arrow, startArrow, minLen, invisible: false };

  if (label !== undefined) {
    token.label = label;
  }

  return token;
}

/**
 * Reads one link at the cursor, or returns null with the cursor unmoved. Handles every stroke, the
 * `<` / `o` / `x` start caps, both label forms, and the `~~~` invisible link.
 */
export function readLink(scanner: Scanner): LinkToken | null {
  const start = scanner.pos;
  const startArrow = capOf(scanner.match(START_CAP)?.[0]);

  const invisible = scanner.match(INVISIBLE);

  if (invisible) {
    const token = link('solid', clampLen(invisible[0].length - 2), 'none', 'none');

    token.invisible = true;

    return token;
  }

  const dottedLabel = scanner.match(DOTTED_LABEL);

  if (dottedLabel) {
    const cap = capOf(dottedLabel[3]);

    return link('dotted', clampLen((dottedLabel[2] ?? '').length), cap, startArrow, dottedLabel[1]);
  }

  const dotted = scanner.match(DOTTED);

  if (dotted) {
    return link('dotted', clampLen((dotted[1] ?? '').length), capOf(dotted[2]), startArrow);
  }

  const thickLabel = scanner.match(THICK_LABEL);

  if (thickLabel) {
    const cap = capOf(thickLabel[3]);

    return link('thick', runLength(thickLabel[2] ?? '', cap), cap, startArrow, thickLabel[1]);
  }

  const thick = scanner.match(THICK);

  if (thick) {
    const cap = capOf(thick[2]);

    return link('thick', runLength(thick[1] ?? '', cap), cap, startArrow);
  }

  const solidLabel = scanner.match(SOLID_LABEL);

  if (solidLabel) {
    const cap = capOf(solidLabel[3]);

    return link('solid', runLength(solidLabel[2] ?? '', cap), cap, startArrow, solidLabel[1]);
  }

  const solid = scanner.match(SOLID);

  if (solid) {
    const cap = capOf(solid[2]);

    return link('solid', runLength(solid[1] ?? '', cap), cap, startArrow);
  }

  scanner.pos = start;

  return null;
}

// -------------------------------------------------------------------------------- statements

const HEADER = /^(flowchart|graph)(?:-([A-Za-z]+))?\s*(.*)$/;
const SUBGRAPH_TITLED = /^([\p{L}\p{N}_][\p{L}\p{N}_.-]*)\s*([[({].*[\])}])$/u;
const CLASS_STATEMENT =
  /^class\s+([\p{L}\p{N}_.-]+(?:\s*,\s*[\p{L}\p{N}_.-]+)*)\s+([\p{L}\p{N}_-]+)\s*$/u;
const CLASS_DEF = /^classDef\s+([\p{L}\p{N}_.,-]+)(?:\s+.*)?$/u;
const DIRECTION_STATEMENT = /^direction\s+([A-Za-z]+)\s*$/;
const ACC_TITLE = /^accTitle\s*:\s*(.*)$/;
const ACC_DESCR_LINE = /^accDescr\s*:\s*(.*)$/;
const ACC_DESCR_BLOCK = /^accDescr\s*\{\s*(.*)$/;

interface PendingNode {
  id: string;
  label?: LabelSource;
  shape?: string;
  classes: string[];
  span: Span;
}

interface PendingEdge {
  from: string;
  to: string;
  token: LinkToken;
  span: Span;
}

interface Pending {
  nodes: PendingNode[];
  edges: PendingEdge[];
}

class FlowchartParser {
  private readonly source: string;
  private readonly report: DiagnosticSink;

  private direction: FlowDirection = 'TB';
  private readonly nodes = new Map<string, FlowNode>();
  private readonly edges: FlowEdge[] = [];
  private readonly clusters: FlowCluster[] = [];
  private readonly clusterIds = new Set<string>();
  private readonly stack: FlowCluster[] = [];
  private readonly classDefs: string[] = [];
  private accTitle: string | undefined;
  private accDescr: string | undefined;
  private ordinal = 0;
  private autoCluster = 0;
  private failures = 0;

  constructor(source: string, ctx: ParseContext) {
    this.source = source;
    this.report = ctx.report;
  }

  run(): FlowchartIR | null {
    const { header, statements } = splitHeader(readLines(this.source));

    if (!header) {
      this.report.error('empty-source', 'Diagram source has no statements.');

      return null;
    }

    this.readHeader(header);

    for (let index = 0; index < statements.length; index += 1) {
      const line = statements[index] as LogicalLine;
      const block = ACC_DESCR_BLOCK.exec(line.text);

      if (block) {
        index = this.readDescriptionBlock(statements, index, block[1] ?? '');
        continue;
      }

      this.statement(line);
    }

    for (const open of this.stack) {
      this.report.warn(
        'unclosed-subgraph',
        `Subgraph '${open.id}' is never closed by an 'end'.`,
        open.span,
      );
    }

    this.stack.length = 0;

    if (this.nodes.size === 0 && this.clusters.length === 0 && this.failures > 0) {
      return null;
    }

    const ir: FlowchartIR = {
      kind: 'flowchart',
      source: this.source,
      direction: this.direction,
      nodes: this.nodes,
      edges: this.edges,
      clusters: this.clusters,
      classDefs: this.classDefs,
    };

    if (this.accTitle !== undefined) {
      ir.accTitle = this.accTitle;
    }

    if (this.accDescr !== undefined) {
      ir.accDescr = this.accDescr;
    }

    return ir;
  }

  private readHeader(line: LogicalLine): void {
    const found = HEADER.exec(line.text);

    if (!found) {
      return;
    }

    if (found[2]) {
      this.report.info(
        'unsupported-construct',
        `Renderer suffix '-${found[2]}' is ignored; the built-in layout engine is always used.`,
        line.span,
      );
    }

    const rest = (found[3] ?? '').trim();

    if (!rest) {
      return;
    }

    const direction = DIRECTIONS[rest.toUpperCase()];

    if (direction) {
      this.direction = direction;

      return;
    }

    this.report.warn(
      'unknown-direction',
      `Unknown direction '${rest}'; using TB.`,
      line.span,
      Object.keys(DIRECTIONS),
    );
  }

  /** Consumes an `accDescr { … }` block and returns the index of its last line. */
  private readDescriptionBlock(
    lines: readonly LogicalLine[],
    start: number,
    first: string,
  ): number {
    const parts: string[] = [];
    let index = start;
    let closed = false;
    let text = first.trim();

    for (;;) {
      if (text.endsWith('}')) {
        closed = true;
        text = text.slice(0, -1).trim();
      }

      if (text) {
        parts.push(text);
      }

      if (closed || index + 1 >= lines.length) {
        break;
      }

      index += 1;
      text = (lines[index] as LogicalLine).text;
    }

    if (!closed) {
      this.report.warn(
        'unclosed-block',
        'accDescr block is missing its closing brace.',
        (lines[start] as LogicalLine).span,
      );
    }

    this.accDescr = parts.join(' ');

    return index;
  }

  private statement(line: LogicalLine): void {
    const text = line.text;

    if (text.startsWith('%%{')) {
      this.report.info(
        'unsupported-construct',
        'Init directives are ignored; configure the diagram through props and CSS instead.',
        line.span,
      );

      return;
    }

    const styling = /^(style|linkStyle|click)\s+\S/.exec(text);

    if (styling) {
      const keyword = styling[1] as string;

      this.report.info(
        'unsupported-construct',
        keyword === 'click'
          ? 'Click bindings are ignored; wire interaction in the React layer instead.'
          : `'${keyword}' is ignored; use classDef plus a CSS rule so the design system owns the paint.`,
        line.span,
      );

      return;
    }

    try {
      if (this.keyword(line, text)) {
        return;
      }

      this.flowStatement(line);
    } catch (cause) {
      this.failures += 1;
      reportStatementError(this.report, cause, line.span);
    }
  }

  /** Returns true when the line was a keyword statement rather than a node/edge statement. */
  private keyword(line: LogicalLine, text: string): boolean {
    if (/^subgraph\b/.test(text)) {
      this.openSubgraph(line);

      return true;
    }

    if (/^end$/.test(text)) {
      this.closeSubgraph(line);

      return true;
    }

    const classDef = CLASS_DEF.exec(text);

    if (classDef) {
      for (const name of (classDef[1] ?? '').split(',')) {
        const trimmed = name.trim();

        if (trimmed && !this.classDefs.includes(trimmed)) {
          this.classDefs.push(trimmed);
        }
      }

      return true;
    }

    const assign = CLASS_STATEMENT.exec(text);

    if (assign) {
      for (const raw of (assign[1] ?? '').split(',')) {
        const id = raw.trim();

        if (id) {
          this.node(id, line.span).classes.push(assign[2] as string);
        }
      }

      return true;
    }

    const direction = DIRECTION_STATEMENT.exec(text);

    if (direction) {
      this.setDirection(direction[1] as string, line.span);

      return true;
    }

    const accTitle = ACC_TITLE.exec(text);

    if (accTitle) {
      this.accTitle = (accTitle[1] ?? '').trim();

      return true;
    }

    const accDescr = ACC_DESCR_LINE.exec(text);

    if (accDescr) {
      this.accDescr = (accDescr[1] ?? '').trim();

      return true;
    }

    return false;
  }

  private setDirection(raw: string, span: Span): void {
    if (this.stack.length > 0) {
      this.report.info(
        'unsupported-construct',
        'Per-subgraph direction is ignored; the whole diagram uses one direction.',
        span,
      );

      return;
    }

    const direction = DIRECTIONS[raw.toUpperCase()];

    if (direction) {
      this.direction = direction;

      return;
    }

    this.report.warn(
      'unknown-direction',
      `Unknown direction '${raw}'; using ${this.direction}.`,
      span,
      Object.keys(DIRECTIONS),
    );
  }

  // --------------------------------------------------------------------------- subgraphs

  private openSubgraph(line: LogicalLine): void {
    const scanner = new Scanner(line.text, line.span);

    scanner.eat('subgraph');

    const rest = readRestOfLine(scanner);
    const titled = SUBGRAPH_TITLED.exec(rest);
    let id: string;
    let label: LabelSource | null = null;

    if (titled) {
      id = titled[1] as string;
      label = parseLabelText((titled[2] as string).slice(1, -1));
    } else if (rest) {
      id = parseLabelText(rest).lines.join(' ') || rest;
      label = { lines: [id] };
    } else {
      this.autoCluster += 1;
      id = `subgraph${this.autoCluster}`;
    }

    if (this.clusterIds.has(id)) {
      this.report.warn('duplicate-subgraph', `Subgraph '${id}' is declared twice.`, line.span);

      let suffix = 2;

      while (this.clusterIds.has(`${id}#${suffix}`)) {
        suffix += 1;
      }

      id = `${id}#${suffix}`;
    }

    const cluster: FlowCluster = {
      id,
      parent: this.stack.at(-1)?.id ?? null,
      span: line.span,
    };

    if (label && label.lines.length > 0) {
      cluster.label = label;
    }

    this.clusterIds.add(id);
    this.clusters.push(cluster);
    this.stack.push(cluster);
  }

  private closeSubgraph(line: LogicalLine): void {
    if (this.stack.pop()) {
      return;
    }

    this.report.warn('unexpected-end', "'end' does not close any open subgraph.", line.span);
  }

  // ---------------------------------------------------------------- nodes, edges, chains

  private flowStatement(line: LogicalLine): void {
    const scanner = new Scanner(line.text, line.span);
    const pending: Pending = { nodes: [], edges: [] };
    let group = this.readGroup(scanner, pending, line.span);

    for (;;) {
      scanner.skipSpace();

      if (scanner.done) {
        break;
      }

      const token = readLink(scanner);

      if (!token) {
        throw new StatementError(
          'unexpected-token',
          `Expected a link or the end of the statement, found '${scanner.rest()}'.`,
          line.span,
          ['-->', '---', '-.->', '==>', '~~~'],
        );
      }

      if (token.label === undefined) {
        const piped = readDelimited(scanner, '|', '|');

        if (piped !== null) {
          token.label = piped;
        }
      }

      const next = this.readGroup(scanner, pending, line.span);

      for (const from of group) {
        for (const to of next) {
          pending.edges.push({ from, to, token, span: line.span });
        }
      }

      group = next;
    }

    this.commit(pending);
  }

  /** One `A & B & C` group; a bare `A` is a group of one. */
  private readGroup(scanner: Scanner, pending: Pending, span: Span): string[] {
    const ids: string[] = [];

    for (;;) {
      ids.push(this.readNodeRef(scanner, pending, span));
      scanner.skipSpace();

      if (!scanner.eat('&')) {
        return ids;
      }

      scanner.skipSpace();
    }
  }

  private readNodeRef(scanner: Scanner, pending: Pending, span: Span): string {
    scanner.skipSpace();

    const start = scanner.pos;
    const id = scanner.match(FLOW_IDENT)?.[0] ?? null;

    if (!id) {
      throw new StatementError(
        'expected-node',
        scanner.done
          ? 'Expected a node after the link.'
          : `Expected a node identifier, found '${scanner.rest()}'.`,
        scanner.spanFrom(start),
      );
    }

    const node: PendingNode = { id, classes: [], span };

    if (scanner.startsWith('@{')) {
      const meta = readDelimited(scanner, '@{', '}');

      if (meta === null) {
        throw new StatementError(
          'unterminated-shape',
          `Node '${id}' has an unterminated '@{' metadata block.`,
          span,
        );
      }

      this.report.info(
        'unsupported-construct',
        `Node metadata on '${id}' is ignored; use the bracket shapes instead.`,
        span,
      );
    }

    this.readShape(scanner, node, span);

    while (scanner.eat(':::')) {
      const name = scanner.match(FLOW_IDENT)?.[0] ?? null;

      if (!name) {
        throw new StatementError(
          'expected-class',
          `Expected a class name after ':::' on '${id}'.`,
          span,
        );
      }

      node.classes.push(name);
    }

    pending.nodes.push(node);

    return id;
  }

  private readShape(scanner: Scanner, node: PendingNode, span: Span): void {
    const start = scanner.pos;

    for (const group of SHAPE_GROUPS) {
      if (!scanner.startsWith(group.open)) {
        continue;
      }

      let best: { end: number; inner: string; shape: string } | null = null;

      for (const candidate of group.closers) {
        scanner.pos = start;

        const inner = readDelimited(scanner, group.open, candidate.close);

        if (inner !== null && (best === null || scanner.pos < best.end)) {
          best = { end: scanner.pos, inner, shape: candidate.shape };
        }
      }

      scanner.pos = start;

      if (!best) {
        continue;
      }

      scanner.pos = best.end;

      if (isMarkdownLabel(best.inner)) {
        this.report.info(
          'unsupported-construct',
          `Markdown string on '${node.id}' is rendered as plain text.`,
          span,
        );
      }

      node.label = parseLabelText(best.inner);
      node.shape = best.shape;

      return;
    }

    if (SHAPE_OPENERS.has(scanner.peek())) {
      throw new StatementError(
        'unterminated-shape',
        `Node '${node.id}' has an unterminated shape near '${scanner.rest()}'.`,
        span,
      );
    }
  }

  /** A statement's nodes and edges land in the IR only once the whole line has parsed. */
  private commit(pending: Pending): void {
    for (const staged of pending.nodes) {
      const node = this.node(staged.id, staged.span);

      if (staged.label) {
        node.label = staged.label;
      }

      if (staged.shape) {
        node.shape = staged.shape;
      }

      for (const name of staged.classes) {
        if (!node.classes.includes(name)) {
          node.classes.push(name);
        }
      }
    }

    for (const staged of pending.edges) {
      const edge: FlowEdge = {
        id: `${staged.from}->${staged.to}#${this.ordinal}`,
        from: staged.from,
        to: staged.to,
        line: staged.token.line,
        arrow: staged.token.arrow,
        startArrow: staged.token.startArrow,
        minLen: staged.token.minLen,
        invisible: staged.token.invisible,
        classes: [],
        span: staged.span,
      };

      if (staged.token.label !== undefined) {
        const label = parseLabelText(staged.token.label);

        if (label.lines.length > 0) {
          edge.label = label;
        }
      }

      this.ordinal += 1;
      this.edges.push(edge);
    }
  }

  /**
   * Nodes are created on first mention, so forward references work. Cluster membership latches to
   * the first subgraph a node appears in, which is why a node mentioned at the top level and then
   * declared inside a subgraph still belongs to that subgraph.
   */
  private node(id: string, span: Span): FlowNode {
    const existing = this.nodes.get(id);
    const enclosing = this.stack.at(-1)?.id ?? null;

    if (existing) {
      if (existing.cluster === null && enclosing !== null) {
        existing.cluster = enclosing;
      }

      return existing;
    }

    const node: FlowNode = {
      id,
      label: { lines: [id] },
      shape: 'rect',
      classes: [],
      cluster: enclosing,
      span,
    };

    this.nodes.set(id, node);

    return node;
  }
}

export function parseFlowchart(source: string, ctx: ParseContext): ParseResult<FlowchartIR> {
  return {
    ir: new FlowchartParser(source, ctx).run(),
    diagnostics: ctx.report.diagnostics,
  };
}
