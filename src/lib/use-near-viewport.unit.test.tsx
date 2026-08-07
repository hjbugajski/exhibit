// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useNearViewport } from '@/lib/use-near-viewport';

/** happy-dom's IntersectionObserver never fires, so the callback is captured and driven by hand. */
function stubObserver() {
  const state: {
    callback: IntersectionObserverCallback | null;
    options: IntersectionObserverInit | undefined;
    observed: Element[];
    disconnected: number;
  } = { callback: null, options: undefined, observed: [], disconnected: 0 };

  class Stub {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      state.callback = callback;
      state.options = options;
    }

    observe(target: Element) {
      state.observed.push(target);
    }

    disconnect() {
      state.disconnected += 1;
    }
  }

  vi.stubGlobal('IntersectionObserver', Stub);

  return state;
}

function Probe() {
  const { ref, mounted } = useNearViewport<HTMLDivElement>();

  return <div ref={ref}>{mounted ? 'mounted' : 'waiting'}</div>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useNearViewport', () => {
  it('mounts immediately where no observer exists', () => {
    vi.stubGlobal('IntersectionObserver', undefined);

    render(<Probe />);

    expect(screen.getByText('mounted')).toBeTruthy();
  });

  it('waits for the container to near the viewport, then latches', () => {
    const observer = stubObserver();

    const { container } = render(<Probe />);

    expect(screen.getByText('waiting')).toBeTruthy();
    expect(observer.observed).toEqual([container.firstChild]);
    expect(observer.options).toEqual({ rootMargin: '200px' });

    act(() => {
      observer.callback?.([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as never);
    });
    expect(screen.getByText('waiting')).toBeTruthy();

    act(() => {
      observer.callback?.([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as never);
    });
    expect(screen.getByText('mounted')).toBeTruthy();
    expect(observer.disconnected).toBe(1);
  });
});
