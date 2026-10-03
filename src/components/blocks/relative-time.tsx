import { formatRelativeTime } from '@/lib/format-time';
import { useHydrated } from '@/lib/use-hydrated';

export interface RelativeTimeProps {
  /** Epoch milliseconds. */
  value: number;
  className?: string;
}

/**
 * Renders a timestamp as a machine-readable <time> whose text is the short relative form and whose
 * tooltip is the absolute date — the relative string alone is unreadable to assistive tech and
 * ambiguous once it reaches "3mo ago".
 *
 * The tooltip is formatted after mount only: Intl resolves against the server's locale and timezone
 * (UTC in the container) during SSR, which would hydrate as a mismatched title on every row. The
 * text is computed from `Date.now()` on both sides, so it may differ at hydration across a minute
 * boundary. Suppressing the hydration warning accepts that, but React then keeps the server text
 * and never patches it, since the client string is unchanged on re-render. Keying on the
 * `useHydrated` flip remounts the element once so the text reflects the client clock.
 */
export function RelativeTime({ value, className }: RelativeTimeProps) {
  const mounted = useHydrated();
  const date = new Date(value);

  return (
    <time
      className={className}
      dateTime={date.toISOString()}
      key={mounted ? 'client' : 'server'}
      suppressHydrationWarning
      title={
        mounted
          ? new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(date)
          : undefined
      }
    >
      {formatRelativeTime(value)}
    </time>
  );
}
