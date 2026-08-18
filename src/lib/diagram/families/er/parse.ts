/*
 * Entity-relationship parser: `erDiagram`.
 *
 * Line-oriented outer loop, recursive descent inside a line, one diagnostic per bad line and carry
 * on — the same driver every other family uses. The one piece of state that spans lines is the open
 * attribute block: `ENTITY {` puts the parser in a mode where each line is an attribute rather than
 * a statement, and an unclosed block auto-closes with a warning at the opening span.
 *
 * Entities are read before they are declared, so a relationship line that turns out to be nonsense
 * leaves no phantom entity behind.
 */

import { StatementError, reportStatementError } from '../../core/diagnostics.ts';
import { ACC_DESCR_BLOCK, readDescriptionBlock } from '../../core/lex/acc.ts';
import type { LogicalLine } from '../../core/lex/lines.ts';
import { readLines, splitHeader } from '../../core/lex/lines.ts';
import { Scanner } from '../../core/lex/scanner.ts';
import {
  readDelimited,
  readIdent,
  readQuotedString,
  readRestOfLine,
} from '../../core/lex/tokens.ts';
import { labelLines } from '../../core/text/label.ts';
import type { DiagnosticSink, ParseContext, ParseResult, Span } from '../../types.ts';
import type { ErAttribute, ErCardinality, ErEntity, ErIR, ErKey, ErRelationship } from './ir.ts';

const HEADER = /^erDiagram\b/;
/**
 * The crow's-foot pair. The left glyph is written outwards (`}o`) and the right one inwards (`o{`),
 * so the two halves have their own alphabets and neither can be mistaken for an entity name: no
 * cardinality starts with a letter, and no entity name starts with `|` or `}`.
 */
const RELATIONSHIP = /(\|o|\|\||\}o|\}\|)(--|\.\.)(o\||\|\||o\{|\|\{)/y;
/** A type or an attribute name. Wider than an id: mermaid writes `string[]`, `list~int~`, `foo(20)`. */
const ATTRIBUTE_TOKEN = /[\p{L}\p{N}_][\p{L}\p{N}_.\-[\]()~<>]*/uy;
const KEY = /(PK|FK|UK)\b/y;

const LEFT_CARDINALITY: Readonly<Record<string, ErCardinality>> = {
  '|o': 'zero-or-one',
  '||': 'exactly-one',
  '}o': 'zero-or-more',
  '}|': 'one-or-more',
};

const RIGHT_CARDINALITY: Readonly<Record<string, ErCardinality>> = {
  'o|': 'zero-or-one',
  '||': 'exactly-one',
  'o{': 'zero-or-more',
  '|{': 'one-or-more',
};

const CARDINALITIES = ['|o', '||', '}o', '}|'];

/** An entity as one statement named it: its id, plus the display name an alias or quotes gave it. */
interface EntityRef {
  id: string;
  label: readonly string[];
}

interface Draft {
  report: DiagnosticSink;
  entities: Map<string, ErEntity>;
  relationships: ErRelationship[];
  /** Entity whose attribute block is open, or null between blocks. */
  open: ErEntity | null;
  accTitle?: string;
  accDescr?: string;
}

/**
 * Declares or refines an entity. An entity named by a relationship before its own block appears
 * starts out empty, so the block fills it in place rather than shadowing it, and a display name is
 * kept once given — mermaid lets either mention carry the alias.
 */
function declare(draft: Draft, ref: EntityRef, span: Span): ErEntity {
  const existing = draft.entities.get(ref.id);

  if (!existing) {
    const created: ErEntity = { id: ref.id, label: ref.label, attributes: [], span };

    draft.entities.set(ref.id, created);

    return created;
  }

  const merged: ErEntity = {
    ...existing,
    label: ref.label.length > 0 ? ref.label : existing.label,
  };

  draft.entities.set(ref.id, merged);

  return merged;
}

/** `CUSTOMER`, `p[Person]` or `"Customer Account"` — the three spellings of one entity. */
function readEntity(scanner: Scanner, span: Span): EntityRef {
  const quoted = readQuotedString(scanner);

  if (quoted !== null) {
    return { id: quoted, label: labelLines(quoted) };
  }

  const id = readIdent(scanner);

  if (!id) {
    throw new StatementError('expected-entity-name', 'Expected an entity name.', span, [
      'entity name',
      '"quoted name"',
    ]);
  }

  const alias = readDelimited(scanner, '[', ']');

  return { id, label: alias === null ? [] : labelLines(alias) };
}

function readKeys(scanner: Scanner): ErKey[] {
  const keys: ErKey[] = [];

  for (;;) {
    scanner.skipSpace();

    const found = scanner.match(KEY)?.[1] as ErKey | undefined;

    if (!found) {
      return keys;
    }

    keys.push(found);
    scanner.skipSpace();
    scanner.eat(',');
  }
}

function attributeStatement(draft: Draft, entity: ErEntity, line: LogicalLine): void {
  const scanner = new Scanner(line.text, line.span);
  const type = scanner.match(ATTRIBUTE_TOKEN)?.[0];

  if (!type) {
    throw new StatementError('expected-attribute-type', 'Expected an attribute type.', line.span, [
      'type',
    ]);
  }

  scanner.skipSpace();

  const name = scanner.match(ATTRIBUTE_TOKEN)?.[0];

  if (!name) {
    throw new StatementError(
      'expected-attribute-name',
      `Expected a name after the attribute type '${type}'.`,
      line.span,
      ['attribute name'],
    );
  }

  const keys = readKeys(scanner);

  scanner.skipSpace();

  const comment = readQuotedString(scanner);

  scanner.skipSpace();

  if (!scanner.done) {
    throw new StatementError(
      'unknown-statement',
      `Expected the end of the attribute after '${name}'.`,
      line.span,
      ['PK', 'FK', 'UK', '"comment"'],
    );
  }

  const attribute: ErAttribute = { type, name, keys, span: line.span };

  if (comment !== null && comment.length > 0) {
    attribute.comment = comment;
  }

  const grown: ErEntity = { ...entity, attributes: [...entity.attributes, attribute] };

  draft.entities.set(entity.id, grown);
  draft.open = grown;
}

function readLabel(scanner: Scanner): readonly string[] {
  scanner.skipSpace();

  if (!scanner.eat(':')) {
    return [];
  }

  scanner.skipSpace();

  const quoted = readQuotedString(scanner);

  return quoted === null ? labelLines(readRestOfLine(scanner)) : labelLines(quoted);
}

function relationshipStatement(draft: Draft, scanner: Scanner, left: EntityRef, span: Span): void {
  const found = scanner.match(RELATIONSHIP);

  if (!found) {
    throw new StatementError(
      'unknown-relationship',
      `Expected a crow's-foot relationship after '${left.id}'.`,
      span,
      CARDINALITIES,
    );
  }

  scanner.skipSpace();

  const right = readEntity(scanner, span);
  const label = readLabel(scanner);

  scanner.skipSpace();

  if (!scanner.done) {
    throw new StatementError(
      'unknown-statement',
      `Expected the end of the relationship after '${right.id}'.`,
      span,
    );
  }

  const from = declare(draft, left, span).id;
  const to = declare(draft, right, span).id;
  const relationship: ErRelationship = {
    id: `${from}--${to}#${draft.relationships.length}`,
    from,
    to,
    fromCardinality: LEFT_CARDINALITY[found[1] as string] as ErCardinality,
    toCardinality: RIGHT_CARDINALITY[found[3] as string] as ErCardinality,
    identifying: found[2] === '--',
    span,
  };

  if (label.length > 0) {
    relationship.label = label;
  }

  draft.relationships.push(relationship);
}

function entityStatement(draft: Draft, scanner: Scanner, span: Span): void {
  const left = readEntity(scanner, span);

  scanner.skipSpace();

  if (scanner.eat('{')) {
    draft.open = declare(draft, left, span);

    return;
  }

  if (scanner.done) {
    declare(draft, left, span);

    return;
  }

  relationshipStatement(draft, scanner, left, span);
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

function statement(draft: Draft, line: LogicalLine): void {
  const text = line.text;

  if (draft.open) {
    if (text === '}') {
      draft.open = null;

      return;
    }

    attributeStatement(draft, draft.open, line);

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
    draft.report.warn(
      'unexpected-end',
      'A `}` with no open attribute block was dropped.',
      line.span,
    );

    return;
  }

  const scanner = new Scanner(text, line.span);
  const start = scanner.pos;
  const keyword = readIdent(scanner);

  switch (keyword) {
    case 'accTitle':
    case 'accDescr':
      accStatement(draft, scanner, keyword);

      return;
    case 'direction':
      draft.report.info(
        'unsupported-construct',
        '`direction` is recognized but not applied; entity-relationship diagrams are laid out top to bottom.',
        line.span,
      );

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
  entityStatement(draft, scanner, line.span);
}

export function parseEr(source: string, ctx: ParseContext): ParseResult<ErIR> {
  const report = ctx.report;
  const { header: first, statements } = splitHeader(readLines(source));

  if (!first || !HEADER.test(first.text)) {
    report.error(
      'missing-header',
      'An entity-relationship diagram must start with `erDiagram`.',
      first?.span,
    );

    return { ir: null, diagnostics: report.diagnostics };
  }

  const draft: Draft = {
    report,
    entities: new Map(),
    relationships: [],
    open: null,
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

  if (draft.open) {
    report.warn(
      'unclosed-block',
      `The attribute block of '${draft.open.id}' was never closed with \`}\`.`,
      draft.open.span,
    );
  }

  const failed = report.diagnostics
    .slice(before)
    .some((diagnostic) => diagnostic.severity === 'error');

  if (draft.entities.size === 0 && failed) {
    return { ir: null, diagnostics: report.diagnostics };
  }

  const ir: ErIR = {
    kind: 'er',
    source,
    entities: [...draft.entities.values()],
    relationships: draft.relationships,
  };

  if (draft.accTitle !== undefined) {
    ir.accTitle = draft.accTitle;
  }

  if (draft.accDescr !== undefined) {
    ir.accDescr = draft.accDescr;
  }

  return { ir, diagnostics: report.diagnostics };
}
