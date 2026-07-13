import type { RequestLogger } from 'evlog';
import { useRequest } from 'nitro/context';

/**
 * Nitro's `useRequest()` (`experimental.asyncContext`, see nitro.config.ts) throws when no request
 * is in flight - which is the case in every raw route handler's unit tests, since they call the
 * handler function directly rather than through Nitro's HTTP pipeline. Returns undefined in that
 * case instead of taking down the handler.
 */
export function requestLog(): RequestLogger | undefined {
  try {
    return useRequest().context?.log as RequestLogger | undefined;
  } catch {
    return undefined;
  }
}
