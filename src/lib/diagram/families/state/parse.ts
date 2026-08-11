/*
 * State-diagram parser: `stateDiagram-v2` (and the v1 header, which we treat identically).
 *
 * Line-oriented outer loop, recursive descent inside a line, one diagnostic per bad line and carry
 * on. Composite states keep an explicit stack; an unclosed `{` auto-closes with a warning at the
 * opening span and a stray `}` is dropped with one.
 */

import { StatementError, reportStatementError } from '../../core/diagnostics.ts';
import type { Direction } from '../../core/graph/model.ts';
import type { LogicalLine } from '../../core/lex/lines.ts';
import { readLines, splitHeader } from '../../core/lex/lines.ts';
import { Scanner } from '../../core/lex/scanner.ts';
import { readQuotedString, readRestOfLine } from '../../core/lex/tokens.ts';
import { labelLines } from '../../core/text/label.ts';
import type { DiagnosticSink, ParseContext, ParseResult, Span } from '../../types.ts';
import type { StateIR, StateNode, StateNodeType, StateNote, StateTransition } from './ir.ts';

const HEADER = /^stateDiagram(?:-v2)?\b/;
/** State ids never contain `-`, so `A-->B` still splits into an id and an arrow. */
const ID = /[\p{L}\p{N}_][\p{L}\p{N}_.]*/uy;
const ARROW = /-{2,}>/y;
const STEREOTYPE = /<<(choice|fork|join)>>/y;
const AS = /as\b/y;
const OF = /of\b/y;
const PLACEMENT = /(left|right)\b/y;
const END_NOTE = /^end\s+note$/i;
const CONCURRENCY = /^--+$/;

const DIRECTIONS: Record<string, Direction> = {
  TB: 'TB',
  TD: 'TB',
  BT: 'BT',
  LR: 'LR',
  RL: 'RL',
};

const STEREOTYPE_TYPES: Record<string, StateNodeType> = {
  choice: 'choice',
  fork: 'fork',
  join: 'join',
};

interface PendingNote {
  target: string;
  placement: 'left' | 'right';
  span: Span;
  lines: string[];
}

interface Draft {
  report: DiagnosticSink;
  states: Map<string, StateNode>;
  transitions: StateTransition[];
  notes: StateNote[];
  /** Open composite states, outermost first. */
  stack: string[];
  direction: Direction;
  accTitle?: string;
  accDescr?: string;
  markers: number;
  pendingNote: PendingNote | null;
}

function parentOf(draft: Draft): string | null {
  return draft.stack.at(-1) ?? null;
}

/**
 * Declares or refines a state. A state referenced before it is described starts out `simple`, so a
 * later `state X { … }` or `<<choice>>` upgrades it in place rather than shadowing it.
 */
function declare(
  draft: Draft,
  id: string,
  type: StateNodeType,
  label: readonly string[],
  span: Span,
): StateNode {
  const existing = draft.states.get(id);

  if (!existing) {
    const created: StateNode = { id, type, label, parent: parentOf(draft), span };

    draft.states.set(id, created);

    return created;
  }

  const merged: StateNode = {
    ...existing,
    type: type === 'simple' ? existing.type : type,
    label: label.length > 0 ? [...existing.label, ...label] : existing.label,
  };

  draft.states.set(id, merged);

  return merged;
}

/** One node per `[*]` occurrence: a start dot when it is a source, an end ring when it is a target. */
function marker(draft: Draft, role: 'source' | 'target', span: Span): string {
  const type: StateNodeType = role === 'source' ? 'start' : 'end';
  const id = `[*]${type}${draft.markers}`;

  draft.markers += 1;
  draft.states.set(id, { id, type, label: [], parent: parentOf(draft), span });

  return id;
}

/**
 * Endpoints are read before they are declared: a statement that turns out to be nonsense must not
 * leave a phantom state behind, so nothing reaches the draft until the whole line has parsed.
 */
function readEndpoint(scanner: Scanner, span: Span): string | null {
  if (scanner.eat('[*]')) {
    return null;
  }

  const id = scanner.match(ID)?.[0];

  if (!id) {
    throw new StatementError('expected-state-id', 'Expected a state name.', span, [
      'state name',
      '[*]',
    ]);
  }

  return id;
}

function commitEndpoint(
  draft: Draft,
  id: string | null,
  role: 'source' | 'target',
  span: Span,
): string {
  return id === null ? marker(draft, role, span) : declare(draft, id, 'simple', [], span).id;
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

  if (draft.stack.length > 0) {
    draft.report.info(
      'unsupported-construct',
      'A `direction` inside a composite state is ignored; the whole diagram uses one direction.',
      span,
    );

    return;
  }

  draft.direction = direction;
}

function stateStatement(draft: Draft, scanner: Scanner, span: Span): void {
  scanner.skipSpace();

  const quoted = readQuotedString(scanner);
  let label: string[] = [];

  if (quoted !== null) {
    label = labelLines(quoted);
    scanner.skipSpace();

    if (!scanner.match(AS)) {
      throw new StatementError('expected-as', 'Expected `as` after a quoted state label.', span, [
        'as',
      ]);
    }

    scanner.skipSpace();
  }

  const id = scanner.match(ID)?.[0];

  if (!id) {
    throw new StatementError('expected-state-id', 'Expected a state name.', span, ['state name']);
  }

  scanner.skipSpace();

  const stereotype = scanner.match(STEREOTYPE)?.[1];

  if (stereotype) {
    declare(draft, id, STEREOTYPE_TYPES[stereotype] as StateNodeType, label, span);

    return;
  }

  if (scanner.eat('{')) {
    declare(draft, id, 'composite', label, span);
    draft.stack.push(id);

    return;
  }

  if (scanner.eat(':')) {
    declare(draft, id, 'simple', labelLines(readRestOfLine(scanner)), span);

    return;
  }

  declare(draft, id, 'simple', label, span);
}

function addNote(
  draft: Draft,
  pending: Omit<PendingNote, 'lines'>,
  lines: readonly string[],
): void {
  draft.notes.push({
    id: `note#${draft.notes.length}`,
    target: pending.target,
    placement: pending.placement,
    label: lines,
    span: pending.span,
  });
}

function noteStatement(draft: Draft, scanner: Scanner, span: Span): void {
  scanner.skipSpace();

  const placement = scanner.match(PLACEMENT)?.[1] as 'left' | 'right' | undefined;

  if (!placement) {
    throw new StatementError(
      'unsupported-construct',
      'A note must be `left of` or `right of`.',
      span,
      ['left of', 'right of'],
    );
  }

  scanner.skipSpace();

  if (!scanner.match(OF)) {
    throw new StatementError('expected-of', 'Expected `of` after the note placement.', span, [
      'of',
    ]);
  }

  scanner.skipSpace();

  const target = scanner.match(ID)?.[0];

  if (!target) {
    throw new StatementError('expected-state-id', 'Expected the state the note belongs to.', span, [
      'state name',
    ]);
  }

  scanner.skipSpace();

  if (scanner.eat(':')) {
    addNote(draft, { target, placement, span }, labelLines(readRestOfLine(scanner)));

    return;
  }

  draft.pendingNote = { target, placement, span, lines: [] };
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

function transitionStatement(draft: Draft, scanner: Scanner, span: Span): void {
  const left = readEndpoint(scanner, span);

  scanner.skipSpace();

  if (scanner.match(ARROW)) {
    scanner.skipSpace();

    const right = readEndpoint(scanner, span);

    scanner.skipSpace();

    const label = scanner.eat(':') ? labelLines(readRestOfLine(scanner)) : [];
    const from = commitEndpoint(draft, left, 'source', span);
    const to = commitEndpoint(draft, right, 'target', span);
    const transition: StateTransition = {
      id: `${from}->${to}#${draft.transitions.length}`,
      from,
      to,
      span,
    };

    if (label.length > 0) {
      transition.label = label;
    }

    draft.transitions.push(transition);

    return;
  }

  if (scanner.eat(':')) {
    const description = labelLines(readRestOfLine(scanner));
    const id = commitEndpoint(draft, left, 'source', span);

    declare(draft, id, 'simple', description, span);

    return;
  }

  if (!scanner.done) {
    throw new StatementError(
      'unknown-statement',
      `Expected a transition or a description after '${left ?? '[*]'}'.`,
      span,
      ['-->', ':'],
    );
  }

  commitEndpoint(draft, left, 'source', span);
}

function closeBlock(draft: Draft, span: Span): void {
  if (draft.stack.length === 0) {
    draft.report.warn('unexpected-end', 'A `}` with no open composite state was dropped.', span);

    return;
  }

  draft.stack.pop();
}

function statement(draft: Draft, line: LogicalLine): void {
  const text = line.text;

  if (draft.pendingNote) {
    if (END_NOTE.test(text)) {
      const { lines, ...pending } = draft.pendingNote;

      addNote(draft, pending, lines);
      draft.pendingNote = null;
    } else {
      draft.pendingNote.lines.push(...labelLines(text));
    }

    return;
  }

  if (text.startsWith('%%{')) {
    draft.report.info(
      'unsupported-directive',
      'Configuration directives (`%%{…}%%`) are ignored.',
      line.span,
    );

    return;
  }

  if (text === '}') {
    closeBlock(draft, line.span);

    return;
  }

  if (CONCURRENCY.test(text)) {
    draft.report.warn(
      'unsupported-construct',
      'Concurrent regions (`--`) are not supported; the states are laid out in one region.',
      line.span,
    );

    return;
  }

  const scanner = new Scanner(text, line.span);
  const start = scanner.pos;
  const keyword = scanner.match(ID)?.[0];

  switch (keyword) {
    case 'direction':
      directionStatement(draft, scanner, line.span);

      return;
    case 'state':
      stateStatement(draft, scanner, line.span);

      return;
    case 'note':
      noteStatement(draft, scanner, line.span);

      return;
    case 'accTitle':
    case 'accDescr':
      accStatement(draft, scanner, keyword);

      return;
    case 'classDef':
    case 'class':
    case 'style':
    case 'click':
      draft.report.info(
        'unsupported-construct',
        `\`${keyword}\` is recognized but not applied; styling comes from the design system.`,
        line.span,
      );

      return;
    default:
      break;
  }

  scanner.pos = start;
  transitionStatement(draft, scanner, line.span);
}

export function parseState(source: string, ctx: ParseContext): ParseResult<StateIR> {
  const report = ctx.report;
  const { header: first, statements } = splitHeader(readLines(source));

  if (!first || !HEADER.test(first.text)) {
    report.error(
      'missing-header',
      'A state diagram must start with `stateDiagram-v2`.',
      first?.span,
    );

    return { ir: null, diagnostics: report.diagnostics };
  }

  const draft: Draft = {
    report,
    states: new Map(),
    transitions: [],
    notes: [],
    stack: [],
    direction: 'TB',
    markers: 0,
    pendingNote: null,
  };
  const before = report.count;

  for (const line of statements) {
    try {
      statement(draft, line);
    } catch (cause) {
      reportStatementError(report, cause, line.span);
    }
  }

  if (draft.pendingNote) {
    const { lines: noteLines, ...pending } = draft.pendingNote;

    report.warn('unclosed-note', 'A note was not closed with `end note`.', pending.span);
    addNote(draft, pending, noteLines);
  }

  for (const open of draft.stack) {
    report.warn(
      'unclosed-block',
      `Composite state '${open}' was never closed with \`}\`.`,
      draft.states.get(open)?.span,
    );
  }

  const failed = report.diagnostics
    .slice(before)
    .some((diagnostic) => diagnostic.severity === 'error');

  if (draft.states.size === 0 && failed) {
    return { ir: null, diagnostics: report.diagnostics };
  }

  const ir: StateIR = {
    kind: 'state',
    source,
    direction: draft.direction,
    states: [...draft.states.values()],
    transitions: draft.transitions,
    notes: draft.notes,
  };

  if (draft.accTitle !== undefined) {
    ir.accTitle = draft.accTitle;
  }

  if (draft.accDescr !== undefined) {
    ir.accDescr = draft.accDescr;
  }

  return { ir, diagnostics: report.diagnostics };
}
