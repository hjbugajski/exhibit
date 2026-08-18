import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { mutations } from '@testing/diagram/fuzz.ts';

import { defaultLimits } from '../../build.ts';
import { Reporter } from '../../core/diagnostics.ts';
import type { Diagnostic } from '../../types.ts';
import type { SequenceIR } from './ir.ts';
import { parseSequence } from './parse.ts';

function parse(source: string): { ir: SequenceIR | null; diagnostics: readonly Diagnostic[] } {
  const report = new Reporter();

  return parseSequence(source, { report, limits: defaultLimits });
}

/** Snapshot view: the structure, without spans or the echoed source. */
function compact(ir: SequenceIR | null): unknown {
  if (!ir) {
    return null;
  }

  return {
    participants: ir.participants.map(
      (participant) =>
        `${participant.actor ? 'actor' : 'participant'} ${participant.id}` +
        ` "${participant.label.join(' | ')}"${participant.implicit ? ' (implicit)' : ''}`,
    ),
    events: ir.events.map((event) => {
      if (event.type === 'message') {
        return (
          `${event.from} ${event.line}/${event.arrow}` +
          `${event.activate ? ' +' : ''}${event.deactivate ? ' -' : ''} ${event.to}` +
          `: ${event.label.join(' | ')}`
        );
      }

      if (event.type === 'note') {
        return `note ${event.placement} ${event.targets.join(',')}: ${event.label.join(' | ')}`;
      }

      if (event.type === 'block-open') {
        return `${event.block} ${event.label.join(' | ')}`.trim();
      }

      if (event.type === 'block-section') {
        return `section ${event.label.join(' | ')}`.trim();
      }

      return event.type === 'block-close' ? 'end' : `${event.type} ${event.target}`;
    }),
    autonumber: ir.autonumber,
    title: ir.title,
    accTitle: ir.accTitle,
    accDescr: ir.accDescr,
  };
}

function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

const header = 'sequenceDiagram';

const cases: { name: string; source: string }[] = [
  { name: 'header only', source: header },
  { name: 'implicit participants from first use', source: `${header}\n  A->>B: hi` },
  {
    name: 'declaration order wins over use order',
    source: `${header}\n  participant B\n  participant A\n  A->>B: hi`,
  },
  { name: 'participant alias', source: `${header}\n  participant C as Claude` },
  { name: 'actor declaration', source: `${header}\n  actor Owner as The owner` },
  {
    name: 'a later declaration refines an implicit participant',
    source: `${header}\n  A->>B: hi\n  participant A as Alice`,
  },
  {
    name: 'participant name with spaces',
    source: `${header}\n  MCP endpoint->>Better Auth: verify`,
  },
  { name: 'solid arrow', source: `${header}\n  A->>B: solid arrow` },
  { name: 'dotted arrow', source: `${header}\n  A-->>B: dotted arrow` },
  { name: 'solid open', source: `${header}\n  A->B: no head` },
  { name: 'dotted open', source: `${header}\n  A-->B: no head, dotted` },
  { name: 'solid cross', source: `${header}\n  A-xB: lost` },
  { name: 'dotted cross', source: `${header}\n  A--xB: lost, dotted` },
  { name: 'solid async', source: `${header}\n  A-)B: fire and forget` },
  { name: 'dotted async', source: `${header}\n  A--)B: fire and forget, dotted` },
  { name: 'self message', source: `${header}\n  A->>A: think` },
  { name: 'activation shorthand', source: `${header}\n  A->>+B: work\n  B-->>-A: done` },
  {
    name: 'explicit activate and deactivate',
    source: `${header}\n  activate B\n  A->>B: work\n  deactivate B`,
  },
  { name: 'note left of', source: `${header}\n  Note left of A: waiting` },
  { name: 'note right of', source: `${header}\n  Note right of A: waiting` },
  { name: 'note over one participant', source: `${header}\n  Note over A: alone` },
  { name: 'note over two participants', source: `${header}\n  Note over A,B: the exchange` },
  { name: 'loop block', source: `${header}\n  loop every hour\n    A->>B: poll\n  end` },
  {
    name: 'alt with else',
    source: `${header}\n  alt valid\n    A->>B: ok\n  else expired\n    A->>B: no\n  end`,
  },
  { name: 'opt block', source: `${header}\n  opt tags\n    A->>B: tag\n  end` },
  {
    name: 'par with and',
    source: `${header}\n  par one\n    A->>B: x\n  and two\n    A->>B: y\n  end`,
  },
  {
    name: 'critical with option',
    source: `${header}\n  critical connect\n    A->>B: x\n  option timeout\n    A->>B: y\n  end`,
  },
  { name: 'break block', source: `${header}\n  break failed\n    A->>B: stop\n  end` },
  {
    name: 'nested blocks',
    source: `${header}\n  loop retry\n    alt ok\n      A->>B: x\n    end\n  end`,
  },
  { name: 'autonumber', source: `${header}\n  autonumber\n  A->>B: one` },
  { name: 'autonumber with start and step', source: `${header}\n  autonumber 10 5\n  A->>B: one` },
  { name: 'autonumber off', source: `${header}\n  autonumber\n  autonumber off\n  A->>B: one` },
  { name: 'title', source: `${header}\n  title Publishing\n  A->>B: x` },
  {
    name: 'accessibility statements',
    source: `${header}\n  accTitle: Publish flow\n  accDescr: Two participants\n  A->>B: x`,
  },
  {
    name: 'label breaks and entities',
    source: `${header}\n  A->>B: first<br/>second #quot;q#quot;`,
  },
  { name: 'comments are stripped', source: `${header}\n  %% a note\n  A->>B: x %% trailing` },
  { name: 'empty message text', source: `${header}\n  A->>B:` },
];

describe('parseSequence', () => {
  it.each(cases)('$name', ({ source }) => {
    expect(compact(parse(source).ir)).toMatchSnapshot();
  });
});

describe('parseSequence structure', () => {
  it('keeps first-mention order and flags what nothing declared', () => {
    const ir = parse(`${header}\n  A->>B: x\n  participant C`).ir as SequenceIR;

    expect(ir.participants.map((participant) => participant.id)).toEqual(['A', 'B', 'C']);
    expect(ir.participants.map((participant) => participant.implicit)).toEqual([true, true, false]);
  });

  it('never adds a second lifeline for a participant declared after use', () => {
    const ir = parse(`${header}\n  A->>B: x\n  participant A as Alice`).ir as SequenceIR;

    expect(ir.participants).toHaveLength(2);
    expect(ir.participants[0]?.label).toEqual(['Alice']);
  });

  it('keeps the span of the line a participant came from', () => {
    const ir = parse(`${header}\n  A->>B: x`).ir as SequenceIR;

    expect(ir.participants[0]?.span).toMatchObject({ line: 2, column: 3 });
  });

  it('closes blocks in the order they were opened', () => {
    const ir = parse(`${header}\n  loop a\n    alt b\n    end\n  end`).ir as SequenceIR;

    expect(ir.events.map((event) => event.type)).toEqual([
      'block-open',
      'block-open',
      'block-close',
      'block-close',
    ]);
  });
});

describe('parseSequence accessibility blocks', () => {
  it('reads a multi-line accDescr block', () => {
    const { ir, diagnostics } = parse(
      `${header}\n  accDescr {\n    some description\n    over two lines\n  }\n  A->>B: x`,
    );

    expect(codes(diagnostics)).toEqual([]);
    expect(ir?.accDescr).toBe('some description over two lines');
    expect((ir as SequenceIR).events).toHaveLength(1);
  });

  it('warns about an accDescr block that is never closed', () => {
    const { ir, diagnostics } = parse(`${header}\n  accDescr {\n    dangling`);

    expect(codes(diagnostics)).toEqual(['unclosed-block']);
    expect(ir?.accDescr).toBe('dangling');
  });
});

describe('parseSequence recovery', () => {
  it('keeps the good statements around a bad one', () => {
    const { ir, diagnostics } = parse(`${header}\n  A->>B: x\n  A B C\n  B->>A: y`);

    expect((ir as SequenceIR).events).toHaveLength(2);
    expect(codes(diagnostics)).toEqual(['expected-arrow']);
    expect(diagnostics[0]).toMatchObject({ severity: 'error', span: { line: 3 } });
  });

  it('reports a message with no text', () => {
    expect(codes(parse(`${header}\n  A->>B`).diagnostics)).toEqual(['expected-message-text']);
  });

  it('reports a note with no placement', () => {
    expect(codes(parse(`${header}\n  Note A: hm`).diagnostics)).toEqual(['expected-placement']);
  });

  it('reports a note with no text', () => {
    expect(codes(parse(`${header}\n  Note over A`).diagnostics)).toEqual(['expected-note-text']);
  });

  it('drops the extra names on a one-sided note', () => {
    const { ir, diagnostics } = parse(`${header}\n  Note right of A,B: hm`);

    expect(codes(diagnostics)).toEqual(['note-over-one']);
    expect((ir as SequenceIR).participants.map((participant) => participant.id)).toEqual(['A']);
  });

  it('drops a section divider with no open block', () => {
    const { ir, diagnostics } = parse(`${header}\n  else nothing\n  A->>B: x`);

    expect(codes(diagnostics)).toEqual(['unexpected-section']);
    expect((ir as SequenceIR).events).toHaveLength(1);
  });

  it('drops a stray end', () => {
    const { ir, diagnostics } = parse(`${header}\n  A->>B: x\n  end`);

    expect(codes(diagnostics)).toEqual(['unexpected-end']);
    expect((ir as SequenceIR).events).toHaveLength(1);
  });

  it('warns about an unclosed block and closes it at the foot', () => {
    const { ir, diagnostics } = parse(`${header}\n  loop forever\n    A->>B: x`);

    expect(codes(diagnostics)).toEqual(['unclosed-block']);
    expect((ir as SequenceIR).events.at(-1)?.type).toBe('block-close');
  });

  it('reads a keyword-named participant as the keyword, the way mermaid refuses to', () => {
    // Pinned rather than endorsed. A line-opening keyword always wins, so `Alt->>B` opens an alt
    // frame instead of sending a message; mermaid raises a hard parse error for the same source.
    // Rescuing it would cost a legitimate block label that starts with an arrow (`alt -> B fails`),
    // so the divergence stays documented until someone decides it is worth a diagnostic.
    const { ir, diagnostics } = parse(`${header}\n  participant Alt\n  Alt->>B: hi`);

    expect(codes(diagnostics)).toEqual(['unclosed-block']);
    expect((ir as SequenceIR).participants.map((participant) => participant.id)).toEqual(['Alt']);
    expect((ir as SequenceIR).events.filter((event) => event.type === 'message')).toHaveLength(0);
  });

  it('lets an unsupported region close with its own end', () => {
    const { ir, diagnostics } = parse(
      `${header}\n  box Server\n    A->>B: x\n  end\n  loop again\n    B->>A: y\n  end`,
    );

    expect(codes(diagnostics)).toEqual(['unsupported-construct']);
    expect((ir as SequenceIR).events.filter((event) => event.type === 'block-open')).toHaveLength(
      1,
    );
  });

  it('reports a missing header', () => {
    const { ir, diagnostics } = parse('flowchart TD\n  A --> B');

    expect(ir).toBeNull();
    expect(codes(diagnostics)).toEqual(['missing-header']);
  });

  it('never throws on truncated or hostile input', () => {
    const sources = [
      header,
      `${header}\n  A->>`,
      `${header}\n  ->>B: x`,
      `${header}\n  participant`,
      `${header}\n  activate`,
      `${header}\n  Note`,
      `${header}\n  Note left of`,
      `${header}\n  autonumber x`,
      `${header}\n  loop\n  alt\n  opt`,
      `${header}\n  end\n  end\n  end`,
      `${header}\n  A<<->>B: both ways`,
      `${header}\n  <<->>B: nobody`,
    ];

    for (const source of sources) {
      expect(() => parse(source), source).not.toThrow();
    }
  });
});

describe('parseSequence unsupported constructs', () => {
  it.each([
    ['box Server', 'unsupported-construct'],
    ['rect rgb(0,255,0)', 'unsupported-construct'],
    ['create participant D', 'unsupported-construct'],
    ['destroy D', 'unsupported-construct'],
    ['link A: Dashboard @ https://x', 'unsupported-construct'],
    ['links A: {"a": "b"}', 'unsupported-construct'],
    ['%%{init: {"theme": "dark"}}%%', 'unsupported-directive'],
  ])('reports %s as %s and keeps parsing', (statement, code) => {
    const { ir, diagnostics } = parse(`${header}\n  ${statement}\n  A->>B: x\n  end`);

    expect(codes(diagnostics)).toContain(code);
    expect(diagnostics[0]?.severity).toBe('info');
    expect((ir as SequenceIR).events.filter((event) => event.type === 'message')).toHaveLength(1);
  });

  it('names the construct in the message', () => {
    expect(parse(`${header}\n  box Server\n  end`).diagnostics[0]?.message).toContain('`box`');
    expect(parse(`${header}\n  create participant D`).diagnostics[0]?.message).toContain(
      '`create`',
    );
  });

  it('draws a bidirectional message with one head rather than inventing a participant', () => {
    const { ir, diagnostics } = parse(`${header}\n  A<<->>B: both ways`);

    expect(codes(diagnostics)).toEqual(['unsupported-construct']);
    expect((ir as SequenceIR).participants.map((participant) => participant.id)).toEqual([
      'A',
      'B',
    ]);
  });
});

describe('parseSequence robustness', () => {
  it.each(loadCorpus('sequence'))('$name survives 200 mutations', ({ source }) => {
    for (const mutated of mutations(source, 200, 11)) {
      expect(() => parse(mutated), mutated).not.toThrow();
    }
  });
});
