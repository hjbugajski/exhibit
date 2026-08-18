/*
 * Sequence IR. Participants are in display order and events are one flat list, with blocks opened
 * and closed by their own events rather than nested arrays.
 *
 * The flat list is the point: layout is a single cursor walking the events in source order, and a
 * tree would have to be flattened back into exactly this before it could be drawn.
 */

import type { DiagramIR, FrameKind, MessageArrow, Span } from '../../types.ts';

export interface SequenceParticipant {
  id: string;
  /** Display label — the `as` alias when there is one, otherwise the id. */
  label: readonly string[];
  /** Declared with `actor` rather than `participant`. */
  actor: boolean;
  /** True when nothing declared it and a message brought it into existence. */
  implicit: boolean;
  span: Span;
}

export type SequenceEvent =
  | {
      type: 'message';
      from: string;
      to: string;
      label: readonly string[];
      line: 'solid' | 'dotted';
      arrow: MessageArrow;
      /** `+` before the target: activates the receiver at this message. */
      activate: boolean;
      /** `-` before the target: deactivates the *sender* at this message. */
      deactivate: boolean;
      span: Span;
    }
  | {
      type: 'note';
      placement: 'left' | 'right' | 'over';
      targets: readonly string[];
      label: readonly string[];
      span: Span;
    }
  | { type: 'activate' | 'deactivate'; target: string; span: Span }
  | { type: 'block-open'; block: FrameKind; label: readonly string[]; span: Span }
  /** `else` / `and` / `option` — a divider inside the block that is already open. */
  | { type: 'block-section'; label: readonly string[]; span: Span }
  | { type: 'block-close'; span: Span };

export interface SequenceIR extends DiagramIR {
  kind: 'sequence';
  participants: readonly SequenceParticipant[];
  events: readonly SequenceEvent[];
  /** Null unless `autonumber` was asked for; the counter is applied during layout. */
  autonumber: { start: number; step: number } | null;
  title?: string;
}
