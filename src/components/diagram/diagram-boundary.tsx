/*
 * The React half of the "nothing throws" contract. `build.ts` already turns a parser or layout
 * failure into an `internal-error` diagnostic and a null scene; a `components` override, a
 * third-party family view or a bad shape entry throws during React's render instead, and there is
 * no route-level boundary anywhere in this app to catch it.
 *
 * So the boundary owns the scene half of the context: a crash below it re-provides the same value
 * with no scene and one more diagnostic, which is byte-for-byte the shape a core failure produces.
 * `Diagram.Svg` renders nothing, `Diagram.Issues` says why, and the binding's source fallback
 * appears — the drawing degrades instead of the page.
 *
 * The degraded pass renders the same children, which is what keeps `Diagram.Issues` and a binding's
 * source fallback on screen — and those are exactly the parts that render *only* when there is no
 * scene, so the degraded pass can fail where the first one did not (a lazy chunk that will not
 * load). React will not catch that here a second time: this fiber already captured for the pass, so
 * the throw would walk past it to a route boundary this app does not have. Hence `LastResort`, a
 * fresh boundary mounted for the degraded pass only: a second failure costs the drawing and its
 * diagnostics, never the page. A new pipeline result (a new source, new overrides) clears the
 * failure and tries once more.
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import type { DiagramSceneValue } from './diagram-context';
import { DiagramSceneProvider } from './diagram-context';

interface DiagramBoundaryProps {
  value: DiagramSceneValue;
  children?: ReactNode;
}

interface DiagramBoundaryState {
  message: string | null;
  /** The value that was being rendered last; a different one is a fresh attempt. */
  seen: DiagramSceneValue | null;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Wraps the degraded pass so the tree that already failed once can fail again without taking the
 * page with it. Nothing is rendered in its place: whatever the children would have said about the
 * failure is what just threw.
 */
class LastResort extends Component<{ children?: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(cause: unknown): void {
    console.error('[diagram] the degraded diagram threw as well; drawing nothing', { cause });
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export class DiagramBoundary extends Component<DiagramBoundaryProps, DiagramBoundaryState> {
  override state: DiagramBoundaryState = { message: null, seen: null };

  static getDerivedStateFromError(cause: unknown): Partial<DiagramBoundaryState> {
    return { message: messageOf(cause) };
  }

  static getDerivedStateFromProps(
    props: DiagramBoundaryProps,
    state: DiagramBoundaryState,
  ): Partial<DiagramBoundaryState> | null {
    if (state.seen === props.value) {
      return null;
    }

    return { message: null, seen: props.value };
  }

  /*
   * Logged rather than rethrown in development. The overridable renderer is the sanctioned escape
   * hatch and the demo page is where overrides are exercised, so a DEV rethrow would trade a named
   * diagnostic for a white page in the one environment that can act on it — and React already
   * prints the error and the component stack there. The message is carried into the diagnostic, so
   * it is on screen either way.
   */
  override componentDidCatch(cause: unknown, info: ErrorInfo): void {
    console.error('[diagram] a diagram part threw while rendering; drawing the source instead', {
      cause,
      componentStack: info.componentStack,
    });
  }

  override render(): ReactNode {
    const { value, children } = this.props;
    const { message } = this.state;

    if (message === null) {
      return <DiagramSceneProvider value={value}>{children}</DiagramSceneProvider>;
    }

    const degraded: DiagramSceneValue = {
      ...value,
      scene: null,
      description: null,
      diagnostics: [
        ...value.diagnostics,
        {
          severity: 'error',
          code: 'internal-error',
          message: `Drawing the diagram failed: ${message}`,
        },
      ],
    };

    return (
      <DiagramSceneProvider value={degraded}>
        {/* Keyed on the message, so a later, different failure gets a boundary that has not yet
            given up rather than the exhausted one. */}
        <LastResort key={message}>{children}</LastResort>
      </DiagramSceneProvider>
    );
  }
}
