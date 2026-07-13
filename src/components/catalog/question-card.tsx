import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

/**
 * Internal scaffold shared by `choice.tsx` and `rating.tsx` - the Card + fieldset + sr-only legend
 * + visible label shell around each question's actual control. Not a catalog component, not
 * registered in the registry.
 */

export interface QuestionCardProps {
  cardClassName?: string;
  contentClassName?: string;
  label: ReactNode;
  children: ReactNode;
}

export function QuestionCard({
  cardClassName,
  contentClassName,
  label,
  children,
}: QuestionCardProps) {
  return (
    <Card.Root className={cardClassName}>
      {/* Layout classes go on the inner div, never the fieldset — Safari's legend carve-out keeps
          fieldsets from being reliable flex containers, which mis-aligns the control against the
          label. */}
      <fieldset>
        <legend className="sr-only">{label}</legend>
        <div className={contentClassName}>
          <p className="text-sm font-medium">{label}</p>
          {children}
        </div>
      </fieldset>
    </Card.Root>
  );
}
