import { useEffect, useRef, useState } from 'react';

/**
 * One-way latch for deferring an expensive child until its container nears the viewport: `mounted`
 * flips once and stays, because tearing the child back down on scroll-out would throw away the work
 * the deferral was protecting. Where no observer exists the deferral is dropped, not the child.
 */
export function useNearViewport<T extends Element>(): {
  ref: React.RefObject<T | null>;
  mounted: boolean;
} {
  const ref = useRef<T>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const container = ref.current;

    if (!container || typeof IntersectionObserver === 'undefined') {
      setMounted(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  return { ref, mounted };
}
