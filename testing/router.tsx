// Imported only by happy-dom-pragma tests, so DOM APIs are fine here.
import type { ReactNode } from 'react';

import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';

/**
 * Renders `ui` inside a minimal, self-contained route tree (unrelated to the app's real routeTree)
 * - just enough to satisfy components that call `<Link>`/`useNavigate()`/`useRouter()` and need a
 * router context.
 *
 * `ui` is mounted at `mountPath` (default "/"); any other `extraPaths` become dummy routes
 * (rendering `null`) so link hrefs targeting them resolve. `initialEntry` sets the memory history's
 * starting location (default `mountPath`).
 */
export function renderWithRouter(
  ui: ReactNode,
  options: { mountPath?: string; extraPaths?: string[]; initialEntry?: string } = {},
) {
  const mountPath = options.mountPath ?? '/';
  const initialEntry = options.initialEntry ?? mountPath;

  const rootRoute = createRootRoute();
  const mountRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: mountPath,
    component: () => ui,
  });
  const extraRoutes = (options.extraPaths ?? []).map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
  );
  const routeTree = rootRoute.addChildren([mountRoute, ...extraRoutes]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  return render(<RouterProvider router={router} />);
}
