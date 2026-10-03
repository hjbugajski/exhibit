import { Radio } from '@base-ui/react/radio';
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
      cardClassName={cn('px-card', flowBlock)}
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
          <Radio.Root
            aria-label={`${star} of 5 stars`}
            className="focus-visible:ring-focus flex cursor-pointer items-center rounded-sm p-0.5 outline-none focus-visible:ring-3"
            key={star}
            // Prevented so the radio skips re-selecting the star this click clears.
            onClick={(event) => {
              if (star !== value) {
                return;
              }

              event.preventDefault();
              set(props.statePath, 0);
            }}
            value={String(star)}
          >
            <Star
              aria-hidden
              className={cn(
                'size-5',
                star <= value ? 'fill-accent text-accent' : 'text-foreground-faint',
              )}
            />
          </Radio.Root>
        ))}
      </RadioGroup.Root>
    </QuestionCard>
  );
}
