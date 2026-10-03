import type { NitroModuleOptions } from 'evlog/nitro';

/**
 * Better Auth puts the live password-reset token in the emailed link's path
 * (`/api/auth/reset-password/<token>`), and evlog logs every request's pathname. `*` matches that
 * one segment only, so the token-free `POST /api/auth/reset-password` still logs.
 */
export const requestLogOptions: NitroModuleOptions = {
  env: { service: 'exhibit' },
  exclude: ['/api/auth/reset-password/*'],
};
