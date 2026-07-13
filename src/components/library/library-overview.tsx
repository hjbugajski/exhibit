import { Link } from '@tanstack/react-router';

import { demosByGroup, libraryGroupOrder } from '@/components/library/registry';

/** Landing page for `/dev/library`: every demo as a card, grouped like the sidebar. */
export function LibraryOverview() {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="text-foreground-muted text-sm">
          House UI components, the artifact catalog Claude composes with, and a full example — each
          with a live playground where the component has props to play with.
        </p>
      </header>
      {libraryGroupOrder.map((group) => (
        <section className="flex flex-col gap-3" key={group}>
          <h2 className="text-foreground-subtle text-xs font-medium tracking-wide uppercase">
            {group}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {demosByGroup[group].map((demo) => (
              <li key={demo.slug}>
                <Link
                  className="hover:bg-surface-subtle flex h-full flex-col gap-1 rounded-lg border p-4 transition-colors"
                  params={{ slug: demo.slug }}
                  to="/dev/library/$slug"
                >
                  <span className="text-sm font-medium">{demo.title}</span>
                  <span className="text-foreground-muted line-clamp-2 text-sm">
                    {demo.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
