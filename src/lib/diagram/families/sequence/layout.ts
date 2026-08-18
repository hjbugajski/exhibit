/*
 * Sequence layout. No search and no iteration: a two-pass constraint solve on x, then a single
 * cursor walking the events down y.
 *
 * x — participants are packed to their minimum spacing from the measured header widths, then the
 * gaps are widened for anything that has to fit between two lifelines (message labels, `over` notes,
 * frame tabs, the lobe a self-message needs to its right). Widening is applied in ascending span
 * length, so short spans settle first and a wide span never has to be re-solved: growing a narrow
 * span can only ever help a wider one that contains it.
 *
 * y — one cursor. Every event advances it, activation bars are a stack per participant, and a
 * message whose endpoint is active terminates on the bar edge rather than the lifeline. Frames
 * record the cursor at their open and close, and take their horizontal extent from the content that
 * was actually drawn inside them, padded by nesting depth so no two borders share a pixel.
 *
 * Autonumber prefixes are applied before measurement — the number is part of the label the widening
 * pass has to make room for.
 */

import { Reporter } from '../../core/diagnostics.ts';
import { reportExtent } from '../../core/extent.ts';
import { arrowHead } from '../../core/geometry/arrow.ts';
import { linearD, orthoD } from '../../core/geometry/path.ts';
import { textStyle, wrapLabel } from '../../core/text/measure.ts';
import type { DiagramMetrics } from '../../metrics.ts';
import type {
  FrameKind,
  LabelBox,
  LayoutOptions,
  LayoutResult,
  MessageArrow,
  PlacedLabel,
  Point,
  Rect,
  SceneActivation,
  SceneFrame,
  SceneFrameSection,
  SceneMessage,
  SceneNote,
  SceneParticipant,
  SequenceScene,
  Span,
} from '../../types.ts';
import type { SequenceIR } from './ir.ts';

interface Column {
  id: string;
  label: LabelBox;
  actor: boolean;
  width: number;
  x: number;
  span: Span;
}

interface FrameWork {
  id: string;
  kind: FrameKind;
  depth: number;
  /** Nesting levels below this frame; drives how far its border sits outside its children's. */
  height: number;
  title: LabelBox;
  label: LabelBox;
  /** Participant index range the frame's events touch. */
  first: number;
  last: number;
  sections: LabelBox[];
  span: Span;
  top: number;
  bottom: number;
  tabHeight: number;
  /** Horizontal extent of everything drawn inside, filled during the y walk. */
  contentX1: number;
  contentX2: number;
  sectionYs: number[];
}

interface MessageWork {
  id: string;
  source: string;
  target: string;
  points: Point[];
  line: 'solid' | 'dotted';
  arrow: MessageArrow;
  reversed: boolean;
  self: boolean;
  label?: PlacedLabel;
  span: Span;
}

interface ActivationWork {
  participant: string;
  depth: number;
  startY: number;
  endY: number;
}

/** Widening constraint: `x[to] − x[from]` must be at least `need`. */
interface Requirement {
  from: number;
  to: number;
  need: number;
}

const EMPTY_LABEL: LabelBox = { lines: [], width: 0, height: 0, lineHeight: 0, baseline: 0 };

function unitToward(tip: Point, from: Point): Point {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const length = Math.hypot(dx, dy);

  return length < 1e-9 ? { x: 1, y: 0 } : { x: dx / length, y: dy / length };
}

/**
 * Filled and cross heads are the shared arrow geometry, which also reports where the stroke must
 * stop. Mermaid's async head (`-)`) is an open pair of strokes the line runs all the way into.
 */
function messageHead(
  kind: MessageArrow,
  tip: Point,
  from: Point,
  m: DiagramMetrics,
): { d: string; anchor: Point } | null {
  if (kind === 'none') {
    return null;
  }

  if (kind !== 'async') {
    return arrowHead(kind === 'arrow' ? 'arrow' : 'cross', tip, from, m);
  }

  const unit = unitToward(tip, from);
  const normal = { x: -unit.y, y: unit.x };
  const base = { x: tip.x - unit.x * m.arrowLength, y: tip.y - unit.y * m.arrowLength };
  const half = m.arrowWidth / 2;

  return {
    d: linearD([
      { x: base.x + normal.x * half, y: base.y + normal.y * half },
      tip,
      { x: base.x - normal.x * half, y: base.y - normal.y * half },
    ]),
    anchor: tip,
  };
}

/** The autonumber counter is part of the text, so it has to be there before anything is measured. */
function numbered(lines: readonly string[], counter: number): readonly string[] {
  if (lines.length === 0) {
    return [String(counter)];
  }

  return [`${counter} ${lines[0] as string}`, ...lines.slice(1)];
}

function centred(box: LabelBox, x: number, y: number): PlacedLabel {
  return { box, x, y };
}

export function layoutSequence(
  ir: SequenceIR,
  options: LayoutOptions,
): LayoutResult<SequenceScene> {
  const report = new Reporter();
  const m = options.metrics;
  const style = textStyle(m);
  const wrap = (lines: readonly string[]): LabelBox =>
    lines.length === 0 ? EMPTY_LABEL : wrapLabel(lines, style, options.measurer, m.maxLabelWidth);
  // A message label is a caption on a line, the same role a flowchart edge label plays; a
  // participant header is a node label and stays at node size.
  const messageStyle = textStyle(m, 'edgeLabel');
  const wrapMessage = (lines: readonly string[]): LabelBox =>
    lines.length === 0
      ? EMPTY_LABEL
      : wrapLabel(lines, messageStyle, options.measurer, m.maxLabelWidth);

  if (ir.participants.length > options.limits.nodes) {
    report.error(
      'too-many-nodes',
      `Sequence diagram has ${ir.participants.length} participants; the limit is ${options.limits.nodes}.`,
    );

    return { scene: null, diagnostics: report.diagnostics };
  }

  const messageCount = ir.events.filter((event) => event.type === 'message').length;

  if (messageCount > options.limits.edges) {
    report.error(
      'too-many-edges',
      `Sequence diagram has ${messageCount} messages; the limit is ${options.limits.edges}.`,
    );

    return { scene: null, diagnostics: report.diagnostics };
  }

  // ------------------------------------------------------------------- measurement

  const columns: Column[] = ir.participants.map((participant) => {
    const label = wrap(participant.label);

    return {
      id: participant.id,
      label,
      actor: participant.actor,
      width: Math.max(m.minNodeWidth, label.width + m.nodePaddingX * 2),
      x: 0,
      span: participant.span,
    };
  });
  const indexOf = new Map(columns.map((column, index) => [column.id, index]));
  const headerHeight = columns.reduce(
    (tallest, column) => Math.max(tallest, column.label.height + m.nodePaddingY * 2),
    m.minNodeHeight,
  );

  if (columns.length === 0) {
    report.warn('empty-diagram', 'The sequence diagram has no participants.');

    return {
      scene: {
        kind: 'sequence',
        family: 'sequence',
        size: { width: m.padding * 2, height: m.padding * 2 },
        participants: [],
        messages: [],
        activations: [],
        notes: [],
        frames: [],
      },
      diagnostics: report.diagnostics,
    };
  }

  let counter = ir.autonumber?.start ?? 0;
  const eventLabels: LabelBox[] = ir.events.map((event) => {
    if (event.type === 'message') {
      const lines = ir.autonumber ? numbered(event.label, counter) : event.label;

      counter += ir.autonumber?.step ?? 0;

      return wrapMessage(lines);
    }

    return event.type === 'note' || event.type === 'block-open' || event.type === 'block-section'
      ? wrap(event.label)
      : EMPTY_LABEL;
  });

  // --------------------------------------------------------------- frame structure

  const frames: FrameWork[] = [];
  const structure: FrameWork[] = [];

  const touchStructure = (ids: readonly string[]): void => {
    for (const id of ids) {
      const index = indexOf.get(id);

      if (index === undefined) {
        continue;
      }

      for (const open of structure) {
        open.first = Math.min(open.first, index);
        open.last = Math.max(open.last, index);
      }
    }
  };

  for (const [index, event] of ir.events.entries()) {
    if (event.type === 'message') {
      touchStructure([event.from, event.to]);
    } else if (event.type === 'note') {
      touchStructure(event.targets);
    } else if (event.type === 'activate' || event.type === 'deactivate') {
      touchStructure([event.target]);
    } else if (event.type === 'block-section') {
      structure.at(-1)?.sections.push(eventLabels[index] as LabelBox);
    } else if (event.type === 'block-open') {
      const frame: FrameWork = {
        id: `frame-${frames.length}`,
        kind: event.block,
        depth: structure.length,
        height: 0,
        title: wrap([event.block]),
        label: eventLabels[index] as LabelBox,
        first: columns.length - 1,
        last: 0,
        sections: [],
        span: event.span,
        top: 0,
        bottom: 0,
        tabHeight: 0,
        contentX1: Number.POSITIVE_INFINITY,
        contentX2: Number.NEGATIVE_INFINITY,
        sectionYs: [],
      };

      frames.push(frame);
      structure.push(frame);
    } else {
      const closed = structure.pop();
      const parent = structure.at(-1);

      if (closed && parent) {
        parent.first = Math.min(parent.first, closed.first);
        parent.last = Math.max(parent.last, closed.last);
        parent.height = Math.max(parent.height, closed.height + 1);
      }
    }
  }

  for (const frame of frames) {
    if (frame.first > frame.last) {
      frame.first = 0;
      frame.last = columns.length - 1;
    }
  }

  // ------------------------------------------------------------------ x constraints

  const x: number[] = [];

  for (const [index, column] of columns.entries()) {
    const previous = columns[index - 1];

    x[index] =
      previous === undefined
        ? column.width / 2
        : (x[index - 1] as number) + (previous.width + column.width) / 2 + m.actorMargin;
  }

  const noteWidth = (label: LabelBox): number => label.width + m.nodePaddingX * 2;
  const required: Requirement[] = [];

  /**
   * A span that runs off either end of the row — a self-message on the last participant, a note to
   * the left of the first — has no gap to widen. It costs margin instead, which the y walk records
   * through `extend`.
   */
  const require = (from: number, to: number, need: number): void => {
    if (from >= 0 && to < columns.length && from < to) {
      required.push({ from, to, need });
    }
  };

  for (const [index, event] of ir.events.entries()) {
    const label = eventLabels[index] as LabelBox;

    if (event.type === 'message') {
      const from = indexOf.get(event.from) as number;
      const to = indexOf.get(event.to) as number;

      if (from === to) {
        require(from, from + 1, m.selfLoopSize +
          m.labelGap * 2 +
          label.width +
          (columns[from + 1]?.width ?? 0) / 2);
      } else {
        require(Math.min(from, to), Math.max(from, to), label.width + m.labelGap * 4);
      }

      continue;
    }

    if (event.type !== 'note') {
      continue;
    }

    const targets = event.targets
      .map((id) => indexOf.get(id))
      .filter((entry): entry is number => entry !== undefined);
    const first = Math.min(...targets);
    const last = Math.max(...targets);

    if (event.placement === 'over') {
      require(first, last, noteWidth(label) - m.nodePaddingX * 2);
    } else if (event.placement === 'left') {
      require(first - 1, first, noteWidth(label) +
        m.labelGap +
        (columns[first - 1]?.width ?? 0) / 2);
    } else {
      require(first, first + 1, noteWidth(label) +
        m.labelGap +
        (columns[first + 1]?.width ?? 0) / 2);
    }
  }

  for (const frame of frames) {
    require(frame.first, frame.last, frame.title.width +
      frame.label.width +
      m.labelGap * 6 -
      m.clusterPadding * 2);
  }

  required.sort((a, b) => a.to - a.from - (b.to - b.from) || a.from - b.from || a.need - b.need);

  for (const requirement of required) {
    const current = (x[requirement.to] as number) - (x[requirement.from] as number);

    if (requirement.need <= current) {
      continue;
    }

    const step = (requirement.need - current) / (requirement.to - requirement.from);

    for (let k = requirement.from + 1; k < x.length; k += 1) {
      x[k] =
        (x[k] as number) + step * Math.min(k - requirement.from, requirement.to - requirement.from);
    }
  }

  // -------------------------------------------------------------------- the y walk

  const openFrames: FrameWork[] = [];
  const openActivations = new Map<string, ActivationWork[]>();
  const activations: ActivationWork[] = [];
  const messages: MessageWork[] = [];
  const notes: SceneNote[] = [];
  let minX = 0;
  let maxX = x[columns.length - 1] as number;
  let cursor = m.padding + headerHeight;
  let nextFrame = 0;

  for (const [index, column] of columns.entries()) {
    minX = Math.min(minX, (x[index] as number) - column.width / 2);
    maxX = Math.max(maxX, (x[index] as number) + column.width / 2);
  }

  /** Records a horizontal extent against the scene bounds and every frame currently open. */
  const extend = (x1: number, x2: number): void => {
    minX = Math.min(minX, x1);
    maxX = Math.max(maxX, x2);

    for (const frame of openFrames) {
      frame.contentX1 = Math.min(frame.contentX1, x1);
      frame.contentX2 = Math.max(frame.contentX2, x2);
    }
  };

  /**
   * The bar a participant is drawn with at `depth`, as an extent. A nested bar steps half a width
   * right of its parent (see the emitter below), so the reserved room has to follow the depth or
   * the outermost bar of a deep stack falls outside the viewBox.
   */
  const barExtent = (id: string, depth: number): [number, number] => {
    const centre = x[indexOf.get(id) as number] as number;
    const left = centre - m.activationWidth / 2 + (depth * m.activationWidth) / 2;

    return [left, left + m.activationWidth];
  };

  const activate = (id: string, y: number): void => {
    const stack = openActivations.get(id) ?? [];
    const work: ActivationWork = { participant: id, depth: stack.length, startY: y, endY: y };

    stack.push(work);
    openActivations.set(id, stack);
    activations.push(work);
    extend(...barExtent(id, work.depth));
  };

  const deactivate = (id: string, y: number, span: Span): ActivationWork | null => {
    const work = openActivations.get(id)?.pop();

    if (!work) {
      report.warn('unexpected-deactivate', `'${id}' was deactivated without being active.`, span);

      return null;
    }

    work.endY = y;

    return work;
  };

  /** Left (`-1`) or right (`1`) edge of the bar a participant is currently drawn with. */
  const edgeOf = (id: string, side: -1 | 1): number => {
    const centre = x[indexOf.get(id) as number] as number;
    const top = openActivations.get(id)?.at(-1);

    if (!top) {
      return centre;
    }

    const left = centre - m.activationWidth / 2 + (top.depth * m.activationWidth) / 2;

    return side < 0 ? left : left + m.activationWidth;
  };

  for (const [index, event] of ir.events.entries()) {
    const label = eventLabels[index] as LabelBox;

    if (event.type === 'message') {
      const from = indexOf.get(event.from) as number;
      const to = indexOf.get(event.to) as number;
      const self = from === to;

      cursor += Math.max(label.height + m.labelGap * 2, m.messageMinGap);

      const work: MessageWork = {
        id: `message-${messages.length}`,
        source: event.from,
        target: event.to,
        points: [],
        line: event.line,
        arrow: event.arrow,
        reversed: to < from,
        self,
        span: event.span,
      };

      if (self) {
        const top = cursor;
        const height = Math.max(m.selfLoopSize, label.height + m.labelGap * 2);
        const start = edgeOf(event.from, 1);

        cursor = top + height;

        if (event.activate) {
          activate(event.to, top);
        }

        const end = edgeOf(event.to, 1);

        if (event.deactivate) {
          deactivate(event.from, cursor, event.span);
        }

        const lobe = Math.max(start, end) + m.selfLoopSize;

        work.points = [
          { x: start, y: top },
          { x: lobe, y: top },
          { x: lobe, y: cursor },
          { x: end, y: cursor },
        ];
        extend(Math.min(start, end), lobe);

        if (label.lines.length > 0) {
          work.label = centred(label, lobe + m.labelGap + label.width / 2, (top + cursor) / 2);
          extend(lobe + m.labelGap, lobe + m.labelGap * 2 + label.width);
        }
      } else {
        const y = cursor;
        const forward = to > from ? 1 : -1;
        const start = edgeOf(event.from, forward);

        if (event.activate) {
          activate(event.to, y);
        }

        const end = edgeOf(event.to, forward === 1 ? -1 : 1);

        if (event.deactivate) {
          deactivate(event.from, y, event.span);
        }

        work.points = [
          { x: start, y },
          { x: end, y },
        ];
        extend(Math.min(start, end), Math.max(start, end));

        if (label.lines.length > 0) {
          work.label = centred(label, (start + end) / 2, y - m.labelGap - label.height / 2);
          extend((start + end - label.width) / 2, (start + end + label.width) / 2);
        }
      }

      messages.push(work);

      continue;
    }

    if (event.type === 'note') {
      const targets = event.targets
        .map((id) => indexOf.get(id))
        .filter((entry): entry is number => entry !== undefined);

      if (targets.length === 0) {
        continue;
      }

      const first = Math.min(...targets);
      const last = Math.max(...targets);
      const height = label.height + m.nodePaddingY * 2;
      const margin = m.labelGap * 2;
      let box: Rect;

      cursor += margin;

      if (event.placement === 'over') {
        const centre = ((x[first] as number) + (x[last] as number)) / 2;
        const width = Math.max(
          noteWidth(label),
          (x[last] as number) - (x[first] as number) + m.nodePaddingX * 2,
        );

        box = { x: centre - width / 2, y: cursor, width, height };
      } else if (event.placement === 'left') {
        box = {
          x: (x[first] as number) - m.labelGap - noteWidth(label),
          y: cursor,
          width: noteWidth(label),
          height,
        };
      } else {
        box = {
          x: (x[first] as number) + m.labelGap,
          y: cursor,
          width: noteWidth(label),
          height,
        };
      }

      cursor += height + margin;
      extend(box.x, box.x + box.width);
      notes.push({
        id: `note-${notes.length}`,
        box,
        label: centred(label, box.x + box.width / 2, box.y + height / 2),
        placement: event.placement,
        targets: event.targets,
        span: event.span,
      });

      continue;
    }

    if (event.type === 'activate' || event.type === 'deactivate') {
      cursor += m.labelGap;

      if (event.type === 'activate') {
        activate(event.target, cursor);
      } else {
        const closed = deactivate(event.target, cursor, event.span);

        if (closed) {
          // The bar was reserved when it opened; recording it again here is what puts it inside a
          // frame that only the `deactivate` falls in.
          extend(...barExtent(event.target, closed.depth));
        }
      }

      continue;
    }

    if (event.type === 'block-open') {
      const frame = frames[nextFrame] as FrameWork;

      nextFrame += 1;
      // The cursor is left sitting *on* the previous message's line, so a frame that opened at it
      // drew its top border straight through that arrow. Closing already steps down by the same
      // amount before recording `bottom`; this is the matching step.
      cursor += m.labelGap * 2;
      frame.top = cursor;
      frame.tabHeight = Math.max(m.clusterTitleHeight, frame.title.height + m.labelGap * 2);
      cursor += frame.tabHeight + m.labelGap * 2;
      openFrames.push(frame);

      continue;
    }

    if (event.type === 'block-section') {
      const frame = openFrames.at(-1);

      if (!frame) {
        continue;
      }

      cursor += m.labelGap * 2;
      frame.sectionYs.push(cursor);
      cursor += label.lines.length > 0 ? label.height + m.labelGap * 2 : m.labelGap * 2;

      continue;
    }

    const frame = openFrames.pop();

    if (frame) {
      cursor += m.labelGap * 2;
      frame.bottom = cursor;
    }
  }

  const lifelineBottom = cursor + m.messageMinGap / 2;

  for (const [id, stack] of openActivations) {
    for (const work of stack) {
      report.warn(
        'unclosed-activation',
        `'${id}' was never deactivated; the bar runs to the end of the diagram.`,
        columns[indexOf.get(id) as number]?.span,
      );
      work.endY = lifelineBottom;
    }
  }

  for (const frame of openFrames) {
    frame.bottom = lifelineBottom;
  }

  // ------------------------------------------------------------------- frame boxes

  const framed: SceneFrame[] = frames.map((frame) => {
    const pad = m.clusterPadding + m.strokeWidth * 2 * frame.height;
    const left = Math.min(frame.contentX1, x[frame.first] as number) - pad;
    const tabWidth = frame.title.width + m.labelGap * 4;
    // The label sits beside the tab, and the widening pass cannot always make room for it: a frame
    // whose events touch one participant spans no gap to widen. The box takes the label's right
    // edge instead — plus the gap that precedes it, so the text never sits on the border — and the
    // scene bounds follow the box, which is what keeps the label inside the viewBox.
    const labelRight =
      frame.label.lines.length > 0
        ? left + tabWidth + m.labelGap * 4 + frame.label.width
        : Number.NEGATIVE_INFINITY;
    const right = Math.max(Math.max(frame.contentX2, x[frame.last] as number) + pad, labelRight);
    const box: Rect = {
      x: left,
      y: frame.top,
      width: right - left,
      height: frame.bottom - frame.top,
    };
    const sections: SceneFrameSection[] = frame.sectionYs.map((y, index) => {
      const label = frame.sections[index];

      return label && label.lines.length > 0
        ? {
            y,
            label: centred(
              label,
              left + m.labelGap * 2 + label.width / 2,
              y + m.labelGap + label.height / 2,
            ),
          }
        : { y };
    });
    const built: SceneFrame = {
      id: frame.id,
      kind: frame.kind,
      box,
      tab: { x: left, y: frame.top, width: tabWidth, height: frame.tabHeight },
      title: centred(frame.title, left + tabWidth / 2, frame.top + frame.tabHeight / 2),
      sections,
      depth: frame.depth,
      span: frame.span,
    };

    if (frame.label.lines.length > 0) {
      built.label = centred(
        frame.label,
        left + tabWidth + m.labelGap * 2 + frame.label.width / 2,
        frame.top + frame.tabHeight / 2,
      );
    }

    minX = Math.min(minX, box.x);
    maxX = Math.max(maxX, box.x + box.width);

    return built;
  });

  // ------------------------------------------------------------------------- emit

  const dx = m.padding - minX;
  const footerTop = lifelineBottom;
  const shiftPoint = (point: Point): Point => ({ x: point.x + dx, y: point.y });
  const shiftRect = (rect: Rect): Rect => ({ ...rect, x: rect.x + dx });
  const shiftLabel = (label: PlacedLabel): PlacedLabel => ({ ...label, x: label.x + dx });

  const participants: SceneParticipant[] = columns.map((column, index) => ({
    id: column.id,
    x: (x[index] as number) + dx,
    box: {
      x: (x[index] as number) + dx - column.width / 2,
      y: m.padding,
      width: column.width,
      height: headerHeight,
    },
    footer: {
      x: (x[index] as number) + dx - column.width / 2,
      y: footerTop,
      width: column.width,
      height: headerHeight,
    },
    label: column.label,
    actor: column.actor,
    lifeline: { y1: m.padding + headerHeight, y2: footerTop },
    span: column.span,
  }));

  const drawn: SceneMessage[] = messages.map((work) => {
    const points = work.points.map(shiftPoint);
    const tip = points.at(-1) as Point;
    const from = points.at(-2) as Point;
    const head = messageHead(work.arrow, tip, from, m);
    const stroke = head ? [...points.slice(0, -1), head.anchor] : points;
    const message: SceneMessage = {
      id: work.id,
      source: work.source,
      target: work.target,
      points,
      // The shared elbow emitter, so a self-message's lobe rounds exactly like a graph edge's.
      d: orthoD(stroke, m),
      line: work.line,
      arrow: work.arrow,
      reversed: work.reversed,
      self: work.self,
      span: work.span,
    };

    if (head) {
      message.arrowD = head.d;
    }

    if (work.label) {
      message.label = shiftLabel(work.label);
    }

    return message;
  });

  /**
   * A bar that opens and closes on the same event still has to be visible, so it takes a floor —
   * but never past the foot of the lifeline it belongs to.
   */
  const bars: SceneActivation[] = activations.map((work, index) => {
    const centre = (x[indexOf.get(work.participant) as number] as number) + dx;
    const bottom = Math.min(Math.max(work.endY, work.startY + m.activationWidth), footerTop);

    return {
      id: `activation-${index}`,
      participant: work.participant,
      box: {
        x: centre - m.activationWidth / 2 + (work.depth * m.activationWidth) / 2,
        y: work.startY,
        width: m.activationWidth,
        height: Math.max(bottom - work.startY, 0),
      },
      depth: work.depth,
    };
  });

  const scene: SequenceScene = {
    kind: 'sequence',
    family: 'sequence',
    size: {
      width: maxX - minX + m.padding * 2,
      height: footerTop + headerHeight + m.padding,
    },
    participants,
    messages: drawn,
    activations: bars,
    notes: notes.map((note) => ({
      ...note,
      box: shiftRect(note.box),
      label: shiftLabel(note.label),
    })),
    frames: framed.map((frame) => {
      const shifted: SceneFrame = {
        ...frame,
        box: shiftRect(frame.box),
        tab: shiftRect(frame.tab),
        title: shiftLabel(frame.title),
        sections: frame.sections.map((section) =>
          section.label ? { y: section.y, label: shiftLabel(section.label) } : section,
        ),
      };

      if (frame.label) {
        shifted.label = shiftLabel(frame.label);
      }

      return shifted;
    }),
  };
  const title = ir.title ?? ir.accTitle;

  if (title !== undefined) {
    scene.title = title;
  }

  // Only a `title` line is a caption: `accTitle` names the drawing for a screen reader and is never
  // drawn, the same way `accDescr` stays invisible.
  if (ir.title !== undefined) {
    scene.caption = ir.title;
  }

  if (ir.accDescr !== undefined) {
    scene.description = ir.accDescr;
  }

  reportExtent(report, scene.size);

  return { scene, diagnostics: report.diagnostics };
}
