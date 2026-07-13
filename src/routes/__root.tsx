import type { ReactNode } from 'react';

import { TanStackDevtools } from '@tanstack/react-devtools';
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { createMiddleware } from '@tanstack/react-start';
import { evlogErrorHandler } from 'evlog/nitro/v3';

import appCss from '@/styles.css?url';

export const Route = createRootRoute({
  server: {
    // TanStack Start's error handling layer runs before Nitro's, stripping structured error fields
    // (`why`/`fix`/`link`) from a thrown EvlogError unless intercepted here first.
    middleware: [createMiddleware().server(evlogErrorHandler)],
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Exhibit',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      // SVG first so capable browsers prefer it; .ico is the fallback.
      {
        rel: 'icon',
        href: '/favicon.svg',
        type: 'image/svg+xml',
      },
      {
        rel: 'icon',
        href: '/favicon.ico',
        sizes: '32x32',
      },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png',
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {/* import.meta.env.DEV is statically replaced at build time, so the devtools are
            tree-shaken out of production bundles entirely. */}
        {import.meta.env.DEV ? (
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}
