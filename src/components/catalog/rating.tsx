import { useStateStore, useStateValue } from '@json-render/react';
import { Star } from 'lucide-react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';
import { QuestionCard } from '@/components/catalog/question-card';
import { RadioGroup } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Rating'>;

const STARS = [1, 2, 3, 4, 5];

/**
 * Persisted state is untrusted (could predate this cap, be seeded by a hostile spec, or be a value
 * a different component wrote to the same path) — anything that isn't a real number reads as
 * unrated, and a real one is clamped to a valid star count.
 */
function clampRating(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return 0;
  }

  return Math.min(STARS.length, Math.max(0, Math.trunc(raw)));
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
      cardClassName={cn('px-4', flowBlock)}
      contentClassName="flex items-center justify-between gap-4"
      label={props.label}
    >
      <RadioGroup.Root
        aria-label={props.label}
        className="flex w-auto items-center gap-0.5"
        onValueChange={(next) => set(props.statePath, Number(next))}
        value={value ? String(value) : null}
      >
        {STARS.map((star) => (
          // The control is the Base UI radio input the linter can't see; keyboard flows through the
          // radio group.
          // oxlint-disable-next-line jsx-a11y/label-has-associated-control, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
          <label
            className="has-focus-visible:ring-focus flex cursor-pointer items-center rounded-sm p-0.5 has-focus-visible:ring-3"
            key={star}
            /*
             * Native radios emit no change event when the checked value is unchanged, so
             * onValueChange alone can't see a re-activation of the current star. Since Base UI 1.7
             * the hidden input's clicks no longer bubble to ancestors (base-ui #5176), so clearing
             * needs a handler on each element a click can land on — exactly one fires per
             * activation:
             * - A pointer click on the visible star bubbles to this label; preventDefault cancels
             *   the label's forwarding to the hidden input, so the item handler below never sees it
             *   and no change event re-selects the star.
             * - Keyboard Space (and a direct click on the input) lands on the item handler only.
             */
            onClick={(event) => {
              if (star !== value) {
                return;
              }

              event.preventDefault();
              set(props.statePath, 0);
            }}
          >
            <RadioGroup.Item
              aria-label={`${star} of 5 stars`}
              /* Not sr-only: it doesn't tw-merge against the item's own size/position classes,
                 leaving an invisible in-flow 16px box that spread the stars apart. These utilities
                 replace them. */
              className="absolute size-px opacity-0"
              onClick={(event) => {
                if (star !== value) {
                  return;
                }

                event.preventDefault();
                set(props.statePath, 0);
              }}
              value={String(star)}
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
