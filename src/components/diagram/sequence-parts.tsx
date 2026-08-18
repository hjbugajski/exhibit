/*
 * SVG for the sequence family. Same rule as every other view: `data-part` plus the author intent
 * the scene recorded (`data-kind`, `data-line`, `data-arrow`, `data-placement`), never a paint
 * attribute.
 *
 * Draw order is the whole layout: frames sit behind everything, then the lifelines, then the bars
 * and boxes that cover them, then the messages, and every label last. A message label sits directly
 * on the lifelines it crosses, so — exactly like a flowchart edge label — it needs a plate under it
 * and it must be painted after the last stroke.
 */

import { memo } from 'react';

import { round2 } from '@/lib/diagram/core/geometry/path';
import { labelPlatePadding } from '@/lib/diagram/metrics';
import type {
  PlacedLabel,
  Rect,
  Scene,
  SceneActivation,
  SceneFrame,
  SceneMessage,
  SceneNote,
  SceneParticipant,
} from '@/lib/diagram/types';

import { useDiagramConfig } from './diagram-context';
import { tspans } from './svg-text';

type LabelledMessage = SceneMessage & { label: PlacedLabel };

function box(rect: Rect): { x: number; y: number; width: number; height: number } {
  return {
    x: round2(rect.x),
    y: round2(rect.y),
    width: round2(rect.width),
    height: round2(rect.height),
  };
}

function translate(x: number, y: number): { transform: string } {
  return { transform: `translate(${round2(x)}px, ${round2(y)}px)` };
}

// ------------------------------------------------------------------------------- participants

/** The header, the lifeline it hangs from, and the header repeated at the foot. */
function Participants({ participants }: { participants: readonly SceneParticipant[] }) {
  const { classNames, metrics } = useDiagramConfig();

  if (participants.length === 0) {
    return null;
  }

  return (
    <g data-part="participants" className={classNames.participants}>
      {participants.map((participant) => (
        <g
          className={classNames.participant}
          data-actor={participant.actor ? '' : undefined}
          data-id={participant.id}
          data-part="participant"
          key={participant.id}
        >
          {(['header', 'footer'] as const).map((position) => (
            <g data-part="participant-slot" data-position={position} key={position}>
              <rect
                className={classNames.participantBox}
                data-part="participant-box"
                rx={metrics.cornerRadius}
                {...box(position === 'header' ? participant.box : participant.footer)}
              />
              <text
                className={classNames.participantLabel}
                data-part="participant-label"
                textAnchor="middle"
              >
                {tspans(
                  participant.label,
                  participant.x,
                  (position === 'header' ? participant.box.y : participant.footer.y) +
                    participant.box.height / 2,
                )}
              </text>
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

function Lifelines({ participants }: { participants: readonly SceneParticipant[] }) {
  const { classNames } = useDiagramConfig();

  if (participants.length === 0) {
    return null;
  }

  return (
    <g data-part="lifelines" className={classNames.lifelines}>
      {participants.map((participant) => (
        <line
          className={classNames.lifeline}
          data-id={participant.id}
          data-part="lifeline"
          key={participant.id}
          x1={round2(participant.x)}
          x2={round2(participant.x)}
          y1={round2(participant.lifeline.y1)}
          y2={round2(participant.lifeline.y2)}
        />
      ))}
    </g>
  );
}

// --------------------------------------------------------------------------------- activations

function Activations({ activations }: { activations: readonly SceneActivation[] }) {
  const { classNames } = useDiagramConfig();

  if (activations.length === 0) {
    return null;
  }

  return (
    <g data-part="activations" className={classNames.activations}>
      {activations.map((activation) => (
        <rect
          className={classNames.activation}
          data-depth={activation.depth}
          data-id={activation.id}
          data-part="activation"
          data-participant={activation.participant}
          key={activation.id}
          {...box(activation.box)}
        />
      ))}
    </g>
  );
}

// --------------------------------------------------------------------------------------- notes

function Notes({ notes }: { notes: readonly SceneNote[] }) {
  const { classNames } = useDiagramConfig();

  if (notes.length === 0) {
    return null;
  }

  return (
    <g data-part="notes" className={classNames.notes}>
      {notes.map((note) => (
        <g
          className={classNames.note}
          data-id={note.id}
          data-part="note"
          data-placement={note.placement}
          key={note.id}
        >
          <rect className={classNames.noteBox} data-part="note-box" {...box(note.box)} />
          <text className={classNames.noteLabel} data-part="note-label" textAnchor="middle">
            {tspans(note.label.box, note.label.x, note.label.y)}
          </text>
        </g>
      ))}
    </g>
  );
}

// ------------------------------------------------------------------------------------ messages

function Messages({ messages }: { messages: readonly SceneMessage[] }) {
  const { classNames } = useDiagramConfig();

  if (messages.length === 0) {
    return null;
  }

  return (
    <g data-part="messages" className={classNames.messages}>
      {messages.map((message) => (
        <g
          className={classNames.message}
          data-arrow={message.arrow}
          data-id={message.id}
          data-line={message.line}
          data-part="message"
          data-reversed={message.reversed ? '' : undefined}
          data-self={message.self ? '' : undefined}
          data-source={message.source}
          data-target={message.target}
          key={message.id}
        >
          <path className={classNames.messagePath} d={message.d} data-part="message-path" />
          {message.arrowD && message.arrow !== 'none' ? (
            <path
              className={classNames.messageArrow}
              d={message.arrowD}
              data-arrow={message.arrow}
              data-part="message-arrow"
            />
          ) : null}
        </g>
      ))}
    </g>
  );
}

// -------------------------------------------------------------------------------------- frames

/** `loop` / `alt` / `opt` … — the box, its corner tab, and the dashed dividers inside it. */
function Frames({ frames }: { frames: readonly SceneFrame[] }) {
  const { classNames, metrics } = useDiagramConfig();

  if (frames.length === 0) {
    return null;
  }

  return (
    <g data-part="frames" className={classNames.frames}>
      {frames.map((frame) => (
        <g
          className={classNames.frame}
          data-depth={frame.depth}
          data-id={frame.id}
          data-kind={frame.kind}
          data-part="frame"
          key={frame.id}
        >
          <rect
            className={classNames.frameBox}
            data-part="frame-box"
            rx={metrics.cornerRadius}
            {...box(frame.box)}
          />
          <rect className={classNames.frameTab} data-part="frame-tab" {...box(frame.tab)} />
          {frame.sections.map((section, index) => (
            <line
              className={classNames.frameSection}
              data-part="frame-section"
              key={index}
              x1={round2(frame.box.x)}
              x2={round2(frame.box.x + frame.box.width)}
              y1={round2(section.y)}
              y2={round2(section.y)}
            />
          ))}
        </g>
      ))}
    </g>
  );
}

// -------------------------------------------------------------------------------------- labels

/**
 * Every plate in one layer, drawn after the last stroke. A message label lies across the lifelines
 * it spans, so without this it would be struck through by every one of them.
 */
function Labels({
  frames,
  messages,
}: {
  frames: readonly SceneFrame[];
  messages: readonly SceneMessage[];
}) {
  const { classNames, metrics } = useDiagramConfig();
  const labelled = messages.filter(
    (message): message is LabelledMessage => message.label !== undefined,
  );
  const pad = labelPlatePadding(metrics);

  if (labelled.length === 0 && frames.length === 0) {
    return null;
  }

  return (
    <g data-part="labels" className={classNames.labels}>
      {frames.map((frame) => (
        <g data-id={frame.id} data-kind={frame.kind} data-part="frame-labels" key={frame.id}>
          <text className={classNames.frameTitle} data-part="frame-title" textAnchor="middle">
            {tspans(frame.title.box, frame.title.x, frame.title.y)}
          </text>
          {frame.label ? (
            <text className={classNames.frameLabel} data-part="frame-label" textAnchor="start">
              {tspans(frame.label.box, frame.label.x - frame.label.box.width / 2, frame.label.y)}
            </text>
          ) : null}
          {frame.sections.map((section, index) =>
            section.label ? (
              <text
                className={classNames.frameLabel}
                data-part="frame-section-label"
                key={index}
                textAnchor="start"
              >
                {tspans(
                  section.label.box,
                  section.label.x - section.label.box.width / 2,
                  section.label.y,
                )}
              </text>
            ) : null,
          )}
        </g>
      ))}
      {labelled.map((message) => (
        <g
          className={classNames.messageLabel}
          data-id={message.id}
          data-line={message.line}
          data-part="message-label"
          key={message.id}
          style={translate(message.label.x, message.label.y)}
        >
          <rect
            data-part="message-label-bg"
            height={round2(message.label.box.height + pad * 2)}
            rx={round2(Math.min(pad * 2, metrics.cornerRadius))}
            width={round2(message.label.box.width + pad * 2)}
            x={round2(-message.label.box.width / 2 - pad)}
            y={round2(-message.label.box.height / 2 - pad)}
          />
          <text data-part="message-label-text" textAnchor="middle">
            {tspans(message.label.box, 0, 0)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Painter's order: frames behind, lifelines, then everything that covers them, labels last. */
export const SequenceView = memo(function SequenceView({ scene }: { scene: Scene }) {
  if (scene.kind !== 'sequence') {
    return null;
  }

  return (
    <>
      <Frames frames={scene.frames} />
      <Lifelines participants={scene.participants} />
      <Activations activations={scene.activations} />
      <Notes notes={scene.notes} />
      <Messages messages={scene.messages} />
      <Participants participants={scene.participants} />
      <Labels frames={scene.frames} messages={scene.messages} />
    </>
  );
});
