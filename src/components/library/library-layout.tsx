import { Link, Outlet } from '@tanstack/react-router';

import type { LibraryGroup } from '@/components/library/demo';
import { demosByGroup, libraryGroupOrder } from '@/components/library/registry';

const navLinkClassName =
  'text-foreground-muted hover:bg-surface-active hover:text-foreground data-[status=active]:bg-surface-active data-[status=active]:text-foreground block rounded-md px-2.5 py-1.5 text-sm transition-colors data-[status=active]:font-medium';

function NavGroup({ group }: { group: LibraryGroup }) {
  const demos = demosByGroup[group];

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-foreground-subtle px-2.5 text-xs font-medium tracking-wide uppercase">
        {group}
      </h3>
      <ul className="flex flex-col gap-px">
        {demos.map((demo) => (
          <li key={demo.slug}>
            <Link className={navLinkClassName} params={{ slug: demo.slug }} to="/dev/library/$slug">
              {demo.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Sidebar shell for `/dev/library`; the matched page renders in the `Outlet`. It is the layout
 * route's component itself (loaded lazily) rather than a wrapper the route file imports, so the
 * registry it pulls in stays out of production chunks. The shell fills the viewport below the
 * fixed 64px header (h-16 in AuthedLayout), and the sidebar and page each scroll their own
 * overflow — the body itself never scrolls.
 */
export function LibraryLayout() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-5xl gap-10 px-6">
      <aside className="w-44 shrink-0 [scrollbar-gutter:stable] overflow-y-auto py-12 pr-2">
        <nav aria-label="Component library" className="flex flex-col gap-6">
          <Link activeOptions={{ exact: true }} className={navLinkClassName} to="/dev/library">
            Overview
          </Link>
          {libraryGroupOrder.map((group) => (
            <NavGroup group={group} key={group} />
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto py-12">
        <Outlet />
      </div>
    </div>
  );
}
