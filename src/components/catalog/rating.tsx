import { useStateStore, useStateValue } from '@json-render/react';
import { Star } from 'lucide-react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { QuestionCard } from '@/components/catalog/question-card';
import { RadioGroup } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Rating'>;

const STARS = [1, 2, 3, 4, 5];

/**
 * Persisted state is untrusted (could predate this cap, or be seeded by a hostile spec) — clamp to
 * a valid star count before using it.
 */
function clampRating(raw: number | undefined): number {
  const truncated = Math.trunc(raw ?? 0);

  return Math.min(STARS.length, Math.max(0, truncated));
}

/**
 * Five-star rating; the number lives in the json-render state store (persisted per artifact).
 * Clicking the current rating clears it.
 */
export function Rating({ props }: { props: Props }) {
  const { set } = useStateStore();
  const stored = useStateValue<number>(props.statePath);
  const value = clampRating(stored);

  return (
    <QuestionCard
      cardClassName="px-4"
      contentClassName="flex items-center justify-between gap-4"
      label={props.label}
    >
      <RadioGroup.Root
        aria-label={`${props.label}: ${value} of 5 stars`}
        className="flex w-auto items-center gap-0.5"
        onValueChange={(next) => set(props.statePath, Number(next))}
        value={value ? String(value) : null}
      >
        {STARS.map((star) => (
          // oxlint-disable-next-line jsx-a11y/label-has-associated-control
          <label
            className="has-focus-visible:ring-focus flex cursor-pointer items-center rounded-sm p-0.5 has-focus-visible:ring-3"
            key={star}
          >
            <RadioGroup.Item
              aria-label={`${star} of 5 stars`}
              /* Not sr-only: it doesn't tw-merge against the item's own size/position classes,
                 leaving an invisible in-flow 16px box that spread the stars apart. These utilities
                 replace them. */
              className="absolute size-px opacity-0"
              value={String(star)}
              // Clicking (or Space-activating) the already-selected star clears the rating: native
              // radios don't emit a change event when the checked value is unchanged, so
              // onValueChange alone can't detect a re-click/re-press — this onClick (which fires
              // for both pointer clicks and keyboard activation of the underlying button) handles
              // that case; a genuine new selection is still handled by RadioGroup's onValueChange
              // above.
              onClick={() => {
                if (star === value) {
                  set(props.statePath, 0);
                }
              }}
            />
            <Star
              aria-hidden
              className={cn(
                'size-5',
                star <= value ? 'fill-accent text-accent' : 'text-foreground-faint',
              )}
            />
          </label>
        ))}
      </RadioGroup.Root>
    </QuestionCard>
  );
}
