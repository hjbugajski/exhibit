import { Progress as ProgressPrimitive } from '@base-ui/react/progress';

import { cn } from '@/lib/utils';

export type ProgressRootProps = ProgressPrimitive.Root.Props;

/**
 * Renders Track/Indicator itself after `children` — pass only overlay content (Label/Value);
 * supplying your own Track duplicates the bar.
 */
function Root({ className, children, value, ...props }: ProgressRootProps) {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn('flex flex-wrap gap-3', className)}
      {...props}
    >
      {children}
      <Track>
        <Indicator />
      </Track>
    </ProgressPrimitive.Root>
  );
}

export type ProgressTrackProps = ProgressPrimitive.Track.Props;

function Track({ className, ...props }: ProgressTrackProps) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        'bg-surface-muted relative flex h-1 w-full items-center overflow-x-hidden rounded-full',
        className,
      )}
      data-slot="progress-track"
      {...props}
    />
  );
}

export type ProgressIndicatorProps = ProgressPrimitive.Indicator.Props;

function Indicator({ className, ...props }: ProgressIndicatorProps) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn('bg-accent h-full transition-all', className)}
      {...props}
    />
  );
}

export type ProgressLabelProps = ProgressPrimitive.Label.Props;

function Label({ className, ...props }: ProgressLabelProps) {
  return (
    <ProgressPrimitive.Label
      className={cn('text-sm font-medium', className)}
      data-slot="progress-label"
      {...props}
    />
  );
}

export type ProgressValueProps = ProgressPrimitive.Value.Props;

function Value({ className, ...props }: ProgressValueProps) {
  return (
    <ProgressPrimitive.Value
      className={cn('text-foreground-muted ml-auto text-sm tabular-nums', className)}
      data-slot="progress-value"
      {...props}
    />
  );
}

export const Progress = { Root, Track, Indicator, Label, Value };
