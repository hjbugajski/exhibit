/*
 * Class-diagram parser: `classDiagram` and `classDiagram-v2`, which mermaid treats identically.
 *
 * Line-oriented outer loop, recursive descent inside a line, one diagnostic per bad line and carry
 * on — the same shape as the state parser. Blocks keep an explicit stack because two constructs open
 * one: `namespace X {` groups classes, `class X {` opens a member body, and a `}` closes whichever
 * is innermost. An unclosed block auto-closes with a warning at its opening span; a stray `}` is
 * dropped with one.
 *
 * The two lexical traps of this grammar are both handled before the endpoint reader runs. Generics
 * are written `~T~` rather than `<T>` because the relation operators own the angle brackets, and a
 * relation operator is a marker-line-marker triple (`<|--`, `*--`, `..|>`) rather than a fixed token
 * set, so it is matched as one pattern with two optional ends instead of enumerated.
 */

import { StatementError, reportStatementError } from '../../core/diagnostics.ts';
import type { Direction } from '../../core/graph/model.ts';
import { ACC_DESCR_BLOCK, readDescriptionBlock } from '../../core/lex/acc.ts';
import type { LogicalLine } from '../../core/lex/lines.ts';
import { readLines, splitHeader } from '../../core/lex/lines.ts';
import { Scanner } from '../../core/lex/scanner.ts';
import { readDelimited, readQuotedString, readRestOfLine } from '../../core/lex/tokens.ts';
import { labelLines } from '../../core/text/label.ts';
import type { DiagnosticSink, ParseContext, ParseResult, Span } from '../../types.ts';
import type {
  ClassIR,
  ClassMember,
  ClassNamespace,
  ClassNode,
  ClassRelation,
  ClassVisibility,
  RelationMarker,
} from './ir.ts';
import { renderGenerics } from './ir.ts';

const HEADER = /^classDiagram(?:-v2)?\b/;
/** Class ids never contain `-`, so `A-->B` still splits into an id and a relation. */
const ID = /[\p{L}\p{N}_][\p{L}\p{N}_.]*/uy;
const GENERIC = /~[^~]*~/y;
/**
 * `[marker] line [marker]`. Both ends are optional, so this also matches the plain `--` link and the
 * dotted `..`; `<|` is tried before `<` so `<|--` is not read as an association plus a stray bar.
 */
const RELATION = /(<\||\*|o|<)?(-{2,}|\.{2,})(\|>|\*|o|>)?/y;
const ANNOTATION = /<<([^<>]*)>>/y;
const FOR = /for\b/y;
/** Trailing `*` (abstract) and `$` (static) on a member; kept as text, reported once each. */
const MODIFIER = /[*$]$/;

const DIRECTIONS: Record<string, Direction> = {
  TB: 'TB',
  TD: 'TB',
  BT: 'BT',
  LR: 'LR',
  RL: 'RL',
};

const LEFT_MARKERS: Record<string, RelationMarker> = {
  '<|': 'inheritance',
  '*': 'composition',
  o: 'aggregation',
  '<': 'arrow',
};

const RIGHT_MARKERS: Record<string, RelationMarker> = {
  '|>': 'inheritance',
  '*': 'composition',
  o: 'aggregation',
  '>': 'arrow',
};

const VISIBILITIES = '+-#~';

interface Frame {
  kind: 'class' | 'namespace';
  id: string;
  span: Span;
}

interface Draft {
  report: DiagnosticSink;
  classes: Map<string, ClassNode>;
  relations: ClassRelation[];
  namespaces: Map<string, ClassNamespace>;
  /** Open `namespace`/`class` blocks, outermost first. */
  stack: Frame[];
  direction: Direction;
  accTitle?: string;
  accDescr?: string;
}

function namespaceOf(draft: Draft): string | null {
  return draft.stack.findLast((frame) => frame.kind === 'namespace')?.id ?? null;
}

function openClass(draft: Draft): string | null {
  return draft.stack.at(-1)?.kind === 'class' ? (draft.stack.at(-1) as Frame).id : null;
}

/**
 * Declares or refines a class. A class named by a relation before it is described starts out with
 * its id for a label, so a later `class X["Label"]` upgrades it in place rather than shadowing it.
 */
function declare(draft: Draft, id: string, label: string | null, span: Span): ClassNode {
  const existing = draft.classes.get(id);

  if (!existing) {
    const created: ClassNode = {
      id,
      label: label ?? id,
      attributes: [],
      methods: [],
      namespace: namespaceOf(draft),
      span,
    };

    draft.classes.set(id, created);

    return created;
  }

  if (label === null || label === existing.label) {
    return existing;
  }

  const merged: ClassNode = { ...existing, label };

  draft.classes.set(id, merged);

  return merged;
}

function annotate(draft: Draft, id: string, annotation: string, span: Span): void {
  const target = declare(draft, id, null, span);

  draft.classes.set(id, { ...target, annotation });
}

/**
 * One member line. The compartment is decided by the argument list rather than by a keyword — that
 * is the only thing mermaid's grammar gives us, and it is what mermaid itself splits on.
 */
function addMember(draft: Draft, id: string, raw: string, span: Span): void {
  const target = declare(draft, id, null, span);
  const text = labelLines(raw).join(' ');

  if (!text) {
    return;
  }

  const first = text[0] as string;
  const visibility: ClassVisibility = VISIBILITIES.includes(first)
    ? (first as ClassVisibility)
    : '';
  const body = renderGenerics(visibility ? text.slice(1).trim() : text);

  if (!body) {
    return;
  }

  if (MODIFIER.test(body)) {
    draft.report.info(
      'unsupported-construct',
      'A trailing `*` (abstract) or `$` (static) is drawn as part of the member text rather than as a style.',
      span,
    );
  }

  const member: ClassMember = { visibility, text: body, method: body.includes('('), span };
  const compartment = member.method
    ? { methods: [...target.methods, member] }
    : { attributes: [...target.attributes, member] };

  draft.classes.set(id, { ...target, ...compartment });
}

/** Class name plus its optional `~T~` parameters, which become the `<T>` of the drawn label. */
function readClassRef(scanner: Scanner, span: Span): { id: string; label: string | null } {
  const id = scanner.match(ID)?.[0];

  if (!id) {
    throw new StatementError('expected-class-name', 'Expected a class name.', span, ['class name']);
  }

  const generic = scanner.match(GENERIC)?.[0];

  return { id, label: generic ? renderGenerics(`${id}${generic}`) : null };
}

function directionStatement(draft: Draft, scanner: Scanner, span: Span): void {
  scanner.skipSpace();

  const raw = scanner.match(ID)?.[0] ?? '';
  const direction = DIRECTIONS[raw.toUpperCase()];

  if (!direction) {
    throw new StatementError('unknown-direction', `Unknown direction '${raw}'.`, span, [
      'TB',
      'BT',
      'LR',
      'RL',
    ]);
  }

  draft.direction = direction;
}

function namespaceStatement(draft: Draft, scanner: Scanner, span: Span): void {
  scanner.skipSpace();

  const id = scanner.match(ID)?.[0];

  if (!id) {
    throw new StatementError('expected-namespace-name', 'Expected a namespace name.', span, [
      'namespace name',
    ]);
  }

  scanner.skipSpace();

  if (!scanner.eat('{')) {
    throw new StatementError('expected-block', 'A namespace must open a `{ … }` block.', span, [
      '{',
    ]);
  }

  // Reopening a namespace adds to the one already declared, the way a re-declared class merges.
  if (!draft.namespaces.has(id)) {
    draft.namespaces.set(id, { id, span });
  }

  draft.stack.push({ kind: 'namespace', id, span });
}

/**
 * `class X`, with any of the four things that may follow it: generic parameters, a quoted label in
 * brackets, an annotation, and a member body. A body left open on this line pushes a frame; one that
 * closes on it (`class X { +int a }`) never does.
 */
function classStatement(draft: Draft, scanner: Scanner, span: Span): void {
  scanner.skipSpace();

  const { id, label: generic } = readClassRef(scanner, span);
  const bracketed = readDelimited(scanner, '[', ']');
  const label = bracketed === null ? generic : labelLines(bracketed).join(' ') || null;

  declare(draft, id, label, span);
  scanner.skipSpace();

  const annotation = scanner.match(ANNOTATION)?.[1];

  if (annotation) {
    annotate(draft, id, annotation.trim(), span);
    scanner.skipSpace();
  }

  if (scanner.eat(':')) {
    addMember(draft, id, readRestOfLine(scanner), span);

    return;
  }

  if (!scanner.eat('{')) {
    return;
  }

  const rest = readRestOfLine(scanner);
  const closed = rest.endsWith('}');
  const body = closed ? rest.slice(0, -1).trim() : rest;

  if (body) {
    addMember(draft, id, body, span);
  }

  if (!closed) {
    draft.stack.push({ kind: 'class', id, span });
  }
}

/** `<<interface>> Shape`, the standalone form; the same tokens inside a body annotate that class. */
function annotationStatement(draft: Draft, scanner: Scanner, span: Span): void {
  const annotation = scanner.match(ANNOTATION)?.[1] ?? '';

  scanner.skipSpace();

  const inside = openClass(draft);

  if (inside !== null) {
    annotate(draft, inside, annotation.trim(), span);

    return;
  }

  const { id } = readClassRef(scanner, span);

  annotate(draft, id, annotation.trim(), span);
}

function accStatement(draft: Draft, scanner: Scanner, keyword: 'accTitle' | 'accDescr'): void {
  scanner.skipSpace();
  scanner.eat(':');

  const value = readRestOfLine(scanner).replace(/\s+/g, ' ');

  if (keyword === 'accTitle') {
    draft.accTitle = value;
  } else {
    draft.accDescr = value;
  }
}

function noteStatement(draft: Draft, scanner: Scanner, span: Span): void {
  scanner.skipSpace();
  scanner.match(FOR);

  draft.report.info(
    'unsupported-construct',
    'Notes are recognized but not drawn; put the text in the class body or in a relation label.',
    span,
  );
  readRestOfLine(scanner);
}

/** A quoted multiplicity beside a relation end, or null when this end has none. */
function readCardinality(scanner: Scanner): string | null {
  const quoted = readQuotedString(scanner);

  if (quoted === null) {
    return null;
  }

  scanner.skipSpace();

  return quoted.trim() || null;
}

function relationStatement(draft: Draft, scanner: Scanner, span: Span): void {
  const left = readClassRef(scanner, span);

  scanner.skipSpace();

  if (scanner.eat(':')) {
    addMember(draft, left.id, readRestOfLine(scanner), span);

    return;
  }

  const fromCardinality = readCardinality(scanner);
  const operator = scanner.match(RELATION);

  if (!operator) {
    if (fromCardinality === null && scanner.done) {
      declare(draft, left.id, left.label, span);

      return;
    }

    throw new StatementError(
      'unknown-statement',
      `Expected a relation or a member after '${left.id}'.`,
      span,
      ['-->', '<|--', '*--', 'o--', '..>', ':'],
    );
  }

  scanner.skipSpace();

  const toCardinality = readCardinality(scanner);
  const right = readClassRef(scanner, span);

  scanner.skipSpace();

  const label = scanner.eat(':') ? labelLines(readRestOfLine(scanner)) : [];

  declare(draft, left.id, left.label, span);
  declare(draft, right.id, right.label, span);

  const relation: ClassRelation = {
    id: `${left.id}->${right.id}#${draft.relations.length}`,
    from: left.id,
    to: right.id,
    fromMarker: LEFT_MARKERS[operator[1] ?? ''] ?? 'none',
    toMarker: RIGHT_MARKERS[operator[3] ?? ''] ?? 'none',
    dotted: (operator[2] as string).startsWith('.'),
    span,
  };

  if (label.length > 0) {
    relation.label = label;
  }

  if (fromCardinality !== null) {
    relation.fromCardinality = fromCardinality;
  }

  if (toCardinality !== null) {
    relation.toCardinality = toCardinality;
  }

  draft.relations.push(relation);
}

function closeBlock(draft: Draft, span: Span): void {
  if (draft.stack.length === 0) {
    draft.report.warn('unexpected-end', 'A `}` with no open block was dropped.', span);

    return;
  }

  draft.stack.pop();
}

/** `:::` styling anywhere on a line: reported, cut off, and the rest of the line still parsed. */
function stripCssClass(draft: Draft, text: string, span: Span): string {
  const at = text.indexOf(':::');

  if (at === -1) {
    return text;
  }

  draft.report.info(
    'unsupported-construct',
    'A `:::` class assignment is recognized but not applied; styling comes from the design system.',
    span,
  );

  return text.slice(0, at).trim();
}

function statement(draft: Draft, line: LogicalLine): void {
  const raw = line.text;

  if (raw.startsWith('%%{')) {
    draft.report.info(
      'unsupported-directive',
      'Configuration directives (`%%{…}%%`) are ignored.',
      line.span,
    );

    return;
  }

  const text = stripCssClass(draft, raw, line.span);

  if (!text) {
    return;
  }

  if (text === '}') {
    closeBlock(draft, line.span);

    return;
  }

  // Inside a member body every line is a member, bar the annotation form and the closing brace.
  const inside = openClass(draft);

  if (inside !== null && !text.startsWith('<<')) {
    const closes = text.endsWith('}');
    const body = closes ? text.slice(0, -1).trim() : text;

    if (body) {
      addMember(draft, inside, body, line.span);
    }

    if (closes) {
      closeBlock(draft, line.span);
    }

    return;
  }

  const scanner = new Scanner(text, line.span);

  if (text.startsWith('<<')) {
    annotationStatement(draft, scanner, line.span);

    return;
  }

  const start = scanner.pos;
  const keyword = scanner.match(ID)?.[0];

  switch (keyword) {
    case 'direction':
      directionStatement(draft, scanner, line.span);

      return;
    case 'namespace':
      namespaceStatement(draft, scanner, line.span);

      return;
    case 'class':
      classStatement(draft, scanner, line.span);

      return;
    case 'note':
      noteStatement(draft, scanner, line.span);

      return;
    case 'accTitle':
    case 'accDescr':
      accStatement(draft, scanner, keyword);

      return;
    case 'classDef':
    case 'cssClass':
    case 'style':
    case 'click':
    case 'callback':
    case 'link':
      draft.report.info(
        'unsupported-construct',
        `\`${keyword}\` is recognized but not applied; styling and interaction come from the design system.`,
        line.span,
      );

      return;
    default:
      break;
  }

  scanner.pos = start;
  relationStatement(draft, scanner, line.span);
}

export function parseClass(source: string, ctx: ParseContext): ParseResult<ClassIR> {
  const report = ctx.report;
  const { header: first, statements } = splitHeader(readLines(source));

  if (!first || !HEADER.test(first.text)) {
    report.error('missing-header', 'A class diagram must start with `classDiagram`.', first?.span);

    return { ir: null, diagnostics: report.diagnostics };
  }

  const draft: Draft = {
    report,
    classes: new Map(),
    relations: [],
    namespaces: new Map(),
    stack: [],
    direction: 'TB',
  };
  const before = report.count;

  for (let index = 0; index < statements.length; index += 1) {
    const line = statements[index] as LogicalLine;
    const block = ACC_DESCR_BLOCK.exec(line.text);

    if (block) {
      const read = readDescriptionBlock(statements, index, block[1] ?? '', report);

      draft.accDescr = read.description;
      index = read.end;

      continue;
    }

    try {
      statement(draft, line);
    } catch (cause) {
      reportStatementError(report, cause, line.span);
    }
  }

  for (const open of draft.stack) {
    report.warn(
      'unclosed-block',
      `${open.kind === 'class' ? 'Class' : 'Namespace'} '${open.id}' was never closed with \`}\`.`,
      open.span,
    );
  }

  const failed = report.diagnostics
    .slice(before)
    .some((diagnostic) => diagnostic.severity === 'error');

  if (draft.classes.size === 0 && failed) {
    return { ir: null, diagnostics: report.diagnostics };
  }

  const ir: ClassIR = {
    kind: 'class',
    source,
    direction: draft.direction,
    classes: [...draft.classes.values()],
    relations: draft.relations,
    namespaces: [...draft.namespaces.values()],
  };

  if (draft.accTitle !== undefined) {
    ir.accTitle = draft.accTitle;
  }

  if (draft.accDescr !== undefined) {
    ir.accDescr = draft.accDescr;
  }

  return { ir, diagnostics: report.diagnostics };
}
