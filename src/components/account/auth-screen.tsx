import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

export interface AuthScreenProps {
  /** Screen title, rendered inside the card header. */
  title: ReactNode;
  children: ReactNode;
}

/**
 * Shared shell for the three auth screens (sign-in, reset-password, consent): centered column,
 * left-aligned brand row (mark + wordmark + tagline), and a max-w-sm card. The brand heading
 * ("Exhibit") is the page's h1 on every auth screen, so the card title is always h2.
 */
export function AuthScreen({ title, children }: AuthScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2">
          <img alt="" className="size-12 shrink-0" src="/favicon.svg" />
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold tracking-tight">Exhibit</h1>
            <p className="text-foreground-muted text-xs">A private gallery for Claude artifacts</p>
          </div>
        </div>
        <Card.Root className="w-full">
          <Card.Header>
            <Card.Title render={<h2>{title}</h2>} />
          </Card.Header>
          <Card.Content>{children}</Card.Content>
        </Card.Root>
      </div>
    </div>
  );
}
