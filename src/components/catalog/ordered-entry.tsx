import type { ReactNode } from 'react';

import { MarkdownBody } from '@/components/catalog/markdown-body';

/**
 * Internal scaffold shared by `steps.tsx` (numbered circle marker) and `timeline.tsx` (dot marker +
 * label line) — not a catalog component, not registered in the registry. Owns the rail layout:
 * markers sit centered in a fixed column with a connecting line between entries (hidden after the
 * last).
 */

export interface OrderedEntryProps {
  /**
   * Sized so its center sits on the first text line's center: the size-6 circle matches the title's
   * 24px line; the timeline dot uses `mt-0.5` against its 16px label line.
   */
  marker: ReactNode;
  label?: ReactNode;
  title: ReactNode;
  markdown?: string;
}

export function OrderedEntry({ marker, label, title, markdown }: OrderedEntryProps) {
  return (
    <li className="group/entry flex gap-3">
      <div className="flex w-6 shrink-0 flex-col items-center gap-1.5">
        {marker}
        {/* mb matches the column gap so the rail floats clear of both markers. */}
        <span aria-hidden className="bg-border mb-1.5 w-px flex-1 group-last/entry:hidden" />
      </div>
      <div className="pb-6 group-last/entry:pb-0">
        {label}
        <p className="text-foreground font-semibold">{title}</p>
        {markdown ? <MarkdownBody className="mt-1" markdown={markdown} /> : null}
      </div>
    </li>
  );
}
