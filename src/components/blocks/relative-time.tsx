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
 */
export function RelativeTime({ value, className }: RelativeTimeProps) {
  const date = new Date(value);

  return (
    <time
      className={className}
      dateTime={date.toISOString()}
      title={new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        date,
      )}
    >
      {formatRelativeTime(value)}
    </time>
  );
}
