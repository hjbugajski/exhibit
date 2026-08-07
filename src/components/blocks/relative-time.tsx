import { useEffect, useState } from 'react';

import { formatRelativeTime } from '@/lib/format-time';

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
 * (UTC in the container) during SSR, which would hydrate as a mismatched title on every row.
 */
export function RelativeTime({ value, className }: RelativeTimeProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const date = new Date(value);

  return (
    <time
      className={className}
      dateTime={date.toISOString()}
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
