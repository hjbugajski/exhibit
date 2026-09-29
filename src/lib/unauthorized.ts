/**
 * The session guard's rejection message. Client code matches on it because the error crosses the
 * server-fn RPC boundary serialized, so an `Error` subclass would not survive the trip.
 */
export const UNAUTHORIZED_MESSAGE = 'Unauthorized';

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && error.message === UNAUTHORIZED_MESSAGE;
}
