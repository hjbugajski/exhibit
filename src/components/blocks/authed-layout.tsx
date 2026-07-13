import type { ReactNode } from 'react';

import { Link } from '@tanstack/react-router';

import { AvatarMenu } from '@/components/account/avatar-menu';

export interface AuthedLayoutProps {
  children: ReactNode;
  email: string;
  seed: string;
}

export function AuthedLayout({ children, email, seed }: AuthedLayoutProps) {
  return (
    <div>
      <a
        className="bg-background text-foreground sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-20 focus:rounded-md focus:border focus:px-3 focus:py-2"
        href="#main-content"
      >
        Skip to content
      </a>
      {/* Fixed h-16: full-height pages (the /dev/library shell) size themselves against it. */}
      <header className="bg-background/75 sticky top-0 z-10 h-16 border-b backdrop-blur-md">
        {/* Inner row shares the page content width + padding so the header aligns with it. */}
        <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-between px-6">
          <nav aria-label="Primary">
            <Link className="text-base font-semibold tracking-tight" to="/">
              Exhibit
            </Link>
          </nav>
          <AvatarMenu email={email} seed={seed} />
        </div>
      </header>
      <main id="main-content">{children}</main>
    </div>
  );
}
