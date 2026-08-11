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
 * It cannot loop: the degraded value has no scene, so the family view that threw is never invoked
 * again. A new pipeline result (a new source, new overrides) clears the failure and tries once
 * more.
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
    const degraded: DiagramSceneValue =
      message === null
        ? value
        : {
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

    return <DiagramSceneProvider value={degraded}>{children}</DiagramSceneProvider>;
  }
}
