import { useStateStore, useStateValue } from '@json-render/react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';
import { QuestionCard } from '@/components/catalog/question-card';
import { RadioGroup } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Choice'>;

/**
 * Single-select question; the chosen option id lives in the json-render
 * state store (persisted per artifact).
 */
export function Choice({ props }: { props: Props }) {
  const { set } = useStateStore();
  const selected = useStateValue<string>(props.statePath);

  return (
    <QuestionCard
      cardClassName={cn('px-4', flowBlock)}
      contentClassName="flex flex-col gap-3"
      label={props.label}
    >
      <RadioGroup.Root
        onValueChange={(value) => set(props.statePath, String(value))}
        value={selected ?? null}
      >
        {props.options.map((option) => (
          <label className="flex cursor-pointer items-start gap-3" key={option.id}>
            <RadioGroup.Item className="mt-0.5" value={option.id} />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm">{option.label}</span>
              {option.description ? (
                <span className="text-foreground-muted text-sm">{option.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </RadioGroup.Root>
    </QuestionCard>
  );
}
