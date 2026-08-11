/*
 * Sequence parser. Line-oriented outer loop, one diagnostic per bad line, carry on — the same
 * recovery contract every family here honours.
 *
 * Two things are specific to this grammar. Participant names may contain spaces (mermaid's actor
 * token stops at `-`, `>`, `+`, `:`, `,` and `;`, and so does ours), so endpoints are read as text
 * up to the arrow rather than as identifiers. And `box` / `rect` open a region that a later `end`
 * closes: they are unsupported, but they still have to be *tracked*, or their `end` would close
 * somebody else's block and every frame after it would nest wrong.
 */

import { StatementError, reportStatementError } from '../../core/diagnostics.ts';
import type { LogicalLine } from '../../core/lex/lines.ts';
import { readLines, splitHeader } from '../../core/lex/lines.ts';
import { Scanner } from '../../core/lex/scanner.ts';
import { readRestOfLine } from '../../core/lex/tokens.ts';
import { labelLines } from '../../core/text/label.ts';
import type {
  DiagnosticSink,
  FrameKind,
  MessageArrow,
  ParseContext,
  ParseResult,
  Span,
} from '../../types.ts';
import type { SequenceEvent, SequenceIR, SequenceParticipant } from './ir.ts';

const HEADER = /^sequenceDiagram\b/;

const KEYWORD =
  /(participant|actor|activate|deactivate|autonumber|note|loop|alt|else|opt|par|and|critical|option|break|end|box|rect|links|link|create|destroy|title|accTitle|accDescr)\b/iy;

/** Mermaid's actor token: anything up to a character the message grammar needs. */
const ACTOR = /[^\n,;:+>-]+/y;
const ARROW = /(-{1,2})(>>|>|x|\))/y;
const PLACEMENT = /(?:(left|right)\s+of|(over))\b/iy;
const ALIAS = /^(.*?)\s+as\s+(.+)$/i;
const NUMBER = /\d+/y;
/** Trailing half of mermaid's `A<<->>B`, which the actor reader keeps because `<` is name-legal. */
const BIDIRECTIONAL = /<{1,2}$/;

const BLOCKS: Readonly<Record<string, FrameKind>> = {
  loop: 'loop',
  alt: 'alt',
  opt: 'opt',
  par: 'par',
  critical: 'critical',
  break: 'break',
};

const SECTIONS: ReadonlySet<string> = new Set(['else', 'and', 'option']);

/** Recognized, deliberately not drawn. `box` and `rect` also open a region a later `end` closes. */
const UNSUPPORTED: Readonly<Record<string, string>> = {
  box: '`box` participant groups are not drawn; the participants inside one still are.',
  rect: '`rect` regions are not drawn, because their colour is written into the source; the messages inside one still are.',
  create: '`create` is not supported; the participant is drawn for the whole diagram.',
  destroy: '`destroy` is not supported; the participant is drawn for the whole diagram.',
  link: '`link` menus are not supported.',
  links: '`links` menus are not supported.',
};

const HEADS: Readonly<Record<string, MessageArrow>> = {
  '>>': 'arrow',
  '>': 'none',
  x: 'cross',
  ')': 'async',
};

/** An open block. `kind` is null for `box` / `rect`, which are tracked but never drawn. */
interface OpenBlock {
  kind: FrameKind | null;
  /** Keyword as written, so an unclosed block can name itself. */
  name: string;
  span: Span;
}

interface Draft {
  report: DiagnosticSink;
  participants: Map<string, SequenceParticipant>;
  events: SequenceEvent[];
  stack: OpenBlock[];
  autonumber: { start: number; step: number } | null;
  title?: string;
  accTitle?: string;
  accDescr?: string;
}

function text(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Participants appear in first-mention order, declared or not. A later `participant A as Alias`
 * refines the entry a message already created rather than adding a second lifeline.
 */
function declare(
  draft: Draft,
  id: string,
  span: Span,
  declared?: { label: readonly string[]; actor: boolean },
): SequenceParticipant {
  const existing = draft.participants.get(id);

  if (!existing) {
    const created: SequenceParticipant = {
      id,
      label: declared?.label ?? [id],
      actor: declared?.actor ?? false,
      implicit: declared === undefined,
      span,
    };

    draft.participants.set(id, created);

    return created;
  }

  if (!declared) {
    return existing;
  }

  const merged: SequenceParticipant = {
    ...existing,
    label: declared.label,
    actor: declared.actor,
    implicit: false,
  };

  draft.participants.set(id, merged);

  return merged;
}

function readActor(scanner: Scanner, span: Span, what: string): string {
  const raw = scanner.match(ACTOR)?.[0];
  const name = raw ? text(raw) : '';

  if (!name) {
    throw new StatementError('expected-participant', `Expected ${what}.`, span, [
      'a participant name',
    ]);
  }

  return name;
}

function participantStatement(draft: Draft, scanner: Scanner, span: Span, actor: boolean): void {
  const rest = readRestOfLine(scanner);
  const aliased = ALIAS.exec(rest);
  const id = text(aliased ? (aliased[1] as string) : rest);

  if (!id) {
    throw new StatementError('expected-participant', 'Expected a participant name.', span, [
      'a participant name',
    ]);
  }

  const label = aliased ? labelLines(aliased[2] as string) : [id];

  declare(draft, id, span, { label: label.length > 0 ? label : [id], actor });
}

function activationStatement(
  draft: Draft,
  scanner: Scanner,
  span: Span,
  type: 'activate' | 'deactivate',
): void {
  const target = text(readRestOfLine(scanner));

  if (!target) {
    throw new StatementError('expected-participant', `Expected the participant to ${type}.`, span, [
      'a participant name',
    ]);
  }

  declare(draft, target, span);
  draft.events.push({ type, target, span });
}

function noteStatement(draft: Draft, scanner: Scanner, span: Span): void {
  scanner.skipSpace();

  const found = scanner.match(PLACEMENT);

  if (!found) {
    throw new StatementError(
      'expected-placement',
      'A note must be `left of`, `right of` or `over`.',
      span,
      ['left of', 'right of', 'over'],
    );
  }

  const placement = (found[1]?.toLowerCase() ?? 'over') as 'left' | 'right' | 'over';
  const targets = readRestOfLine(scanner);
  const colon = targets.indexOf(':');

  if (colon === -1) {
    throw new StatementError('expected-note-text', 'Expected `:` and the note text.', span, [':']);
  }

  const named = targets
    .slice(0, colon)
    .split(',')
    .map((entry) => text(entry))
    .filter((entry) => entry.length > 0);

  if (named.length === 0) {
    throw new StatementError(
      'expected-participant',
      'Expected the participant the note belongs to.',
      span,
      ['a participant name'],
    );
  }

  if (placement !== 'over' && named.length > 1) {
    draft.report.warn(
      'note-over-one',
      'A `left of` / `right of` note attaches to one participant; the extra names were dropped.',
      span,
    );
  }

  const kept = placement === 'over' ? named : named.slice(0, 1);

  for (const target of kept) {
    declare(draft, target, span);
  }

  draft.events.push({
    type: 'note',
    placement,
    targets: kept,
    label: labelLines(targets.slice(colon + 1)),
    span,
  });
}

function autonumberStatement(draft: Draft, scanner: Scanner, span: Span): void {
  scanner.skipSpace();

  const start = scanner.match(NUMBER)?.[0];

  if (start === undefined) {
    const rest = readRestOfLine(scanner);

    if (rest.toLowerCase() === 'off') {
      draft.autonumber = null;

      return;
    }

    if (rest) {
      draft.report.warn('unknown-statement', `Ignored '${rest}' after \`autonumber\`.`, span, [
        'a start number',
        'off',
      ]);
    }

    draft.autonumber = { start: 1, step: 1 };

    return;
  }

  scanner.skipSpace();

  const step = scanner.match(NUMBER)?.[0];

  draft.autonumber = { start: Number(start), step: step === undefined ? 1 : Number(step) };
}

function openBlock(draft: Draft, kind: FrameKind, scanner: Scanner, span: Span): void {
  draft.stack.push({ kind, name: kind, span });
  draft.events.push({
    type: 'block-open',
    block: kind,
    label: labelLines(readRestOfLine(scanner)),
    span,
  });
}

function sectionStatement(draft: Draft, scanner: Scanner, span: Span): void {
  const open = draft.stack.at(-1);

  if (!open || open.kind === null) {
    draft.report.warn(
      'unexpected-section',
      'A section divider (`else` / `and` / `option`) with no open block was dropped.',
      span,
    );
    readRestOfLine(scanner);

    return;
  }

  draft.events.push({ type: 'block-section', label: labelLines(readRestOfLine(scanner)), span });
}

function closeBlock(draft: Draft, span: Span): void {
  const open = draft.stack.pop();

  if (!open) {
    draft.report.warn('unexpected-end', 'An `end` with no open block was dropped.', span);

    return;
  }

  if (open.kind !== null) {
    draft.events.push({ type: 'block-close', span });
  }
}

function accStatement(draft: Draft, scanner: Scanner, keyword: string): void {
  scanner.skipSpace();
  scanner.eat(':');

  const value = text(readRestOfLine(scanner));

  if (keyword === 'acctitle') {
    draft.accTitle = value;
  } else {
    draft.accDescr = value;
  }
}

function messageStatement(draft: Draft, scanner: Scanner, span: Span): void {
  const sender = readActor(scanner, span, 'the sending participant');
  const bidirectional = BIDIRECTIONAL.test(sender);
  const from = bidirectional ? text(sender.replace(BIDIRECTIONAL, '')) : sender;

  if (bidirectional) {
    draft.report.info(
      'unsupported-construct',
      'Bidirectional messages (`<<->>`) are drawn with one arrowhead, at the receiving end.',
      span,
    );
  }

  if (!from) {
    throw new StatementError('expected-participant', 'Expected the sending participant.', span, [
      'a participant name',
    ]);
  }

  const arrow = scanner.match(ARROW);

  if (!arrow) {
    throw new StatementError('expected-arrow', `Expected a message arrow after '${from}'.`, span, [
      '->>',
      '-->>',
      '->',
      '-->',
      '-x',
      '--x',
      '-)',
      '--)',
    ]);
  }

  const activate = scanner.eat('+');
  const deactivate = !activate && scanner.eat('-');
  const to = readActor(scanner, span, 'the receiving participant');

  if (!scanner.eat(':')) {
    throw new StatementError('expected-message-text', 'Expected `:` and the message text.', span, [
      ':',
    ]);
  }

  declare(draft, from, span);
  declare(draft, to, span);
  draft.events.push({
    type: 'message',
    from,
    to,
    label: labelLines(readRestOfLine(scanner)),
    line: (arrow[1] as string).length === 2 ? 'dotted' : 'solid',
    arrow: HEADS[arrow[2] as string] as MessageArrow,
    activate,
    deactivate,
    span,
  });
}

function statement(draft: Draft, line: LogicalLine): void {
  if (line.text.startsWith('%%{')) {
    draft.report.info(
      'unsupported-directive',
      'Configuration directives (`%%{…}%%`) are ignored.',
      line.span,
    );

    return;
  }

  const scanner = new Scanner(line.text, line.span);
  const keyword = scanner.match(KEYWORD)?.[0]?.toLowerCase();

  if (keyword === undefined) {
    messageStatement(draft, scanner, line.span);

    return;
  }

  const unsupported = UNSUPPORTED[keyword];

  if (unsupported) {
    draft.report.info('unsupported-construct', unsupported, line.span);

    if (keyword === 'box' || keyword === 'rect') {
      draft.stack.push({ kind: null, name: keyword, span: line.span });
    }

    return;
  }

  const block = BLOCKS[keyword];

  if (block) {
    openBlock(draft, block, scanner, line.span);

    return;
  }

  if (SECTIONS.has(keyword)) {
    sectionStatement(draft, scanner, line.span);

    return;
  }

  switch (keyword) {
    case 'participant':
    case 'actor':
      participantStatement(draft, scanner, line.span, keyword === 'actor');

      return;
    case 'activate':
    case 'deactivate':
      activationStatement(draft, scanner, line.span, keyword);

      return;
    case 'note':
      noteStatement(draft, scanner, line.span);

      return;
    case 'autonumber':
      autonumberStatement(draft, scanner, line.span);

      return;
    case 'end':
      closeBlock(draft, line.span);

      return;
    case 'title':
      scanner.skipSpace();
      scanner.eat(':');
      draft.title = text(readRestOfLine(scanner));

      return;
    case 'acctitle':
    case 'accdescr':
      accStatement(draft, scanner, keyword);

      return;
  }
}

export function parseSequence(source: string, ctx: ParseContext): ParseResult<SequenceIR> {
  const report = ctx.report;
  const { header: first, statements } = splitHeader(readLines(source));

  if (!first || !HEADER.test(first.text)) {
    report.error(
      'missing-header',
      'A sequence diagram must start with `sequenceDiagram`.',
      first?.span,
    );

    return { ir: null, diagnostics: report.diagnostics };
  }

  const draft: Draft = {
    report,
    participants: new Map(),
    events: [],
    stack: [],
    autonumber: null,
  };
  const before = report.count;

  for (const line of statements) {
    try {
      statement(draft, line);
    } catch (cause) {
      reportStatementError(report, cause, line.span);
    }

    if (draft.participants.size > ctx.limits.nodes) {
      report.error(
        'too-many-nodes',
        `Sequence diagram has more than ${ctx.limits.nodes} participants.`,
        line.span,
      );

      return { ir: null, diagnostics: report.diagnostics };
    }
  }

  for (const open of draft.stack.reverse()) {
    report.warn(
      'unclosed-block',
      `A \`${open.name}\` block was never closed with \`end\`.`,
      open.span,
    );

    if (open.kind !== null) {
      draft.events.push({ type: 'block-close', span: open.span });
    }
  }

  const failed = report.diagnostics
    .slice(before)
    .some((diagnostic) => diagnostic.severity === 'error');

  if (draft.participants.size === 0 && failed) {
    return { ir: null, diagnostics: report.diagnostics };
  }

  const ir: SequenceIR = {
    kind: 'sequence',
    source,
    participants: [...draft.participants.values()],
    events: draft.events,
    autonumber: draft.autonumber,
  };

  if (draft.title !== undefined) {
    ir.title = draft.title;
  }

  if (draft.accTitle !== undefined) {
    ir.accTitle = draft.accTitle;
  }

  if (draft.accDescr !== undefined) {
    ir.accDescr = draft.accDescr;
  }

  return { ir, diagnostics: report.diagnostics };
}
