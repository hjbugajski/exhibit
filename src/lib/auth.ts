import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { oauthProvider } from '@better-auth/oauth-provider';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { jwt } from 'better-auth/plugins';
import { tanstackStartCookies } from 'better-auth/tanstack-start';

/**
 * Relative imports (not the `@/*` alias) so this module can be executed directly by plain `node`
 * (see scripts/seed.ts), which does not resolve tsconfig path aliases.
 */
import { db } from '../database/index.ts';
import * as authSchema from '../database/schemas/auth.ts';
import { env } from './env.ts';
import { mailerConfigured, sendEmail } from './mailer.ts';

/**
 * The email callbacks below sit inside conditional spreads, which defeat excess-property checking —
 * a renamed/typo'd key would compile and silently ship a dead feature (it happened once).
 * `satisfies Pick<...>` restores the check: it errors on unknown keys and when Better Auth renames
 * the option.
 */
type EmailPasswordOptions = NonNullable<BetterAuthOptions['emailAndPassword']>;
type ChangeEmailOptions = NonNullable<NonNullable<BetterAuthOptions['user']>['changeEmail']>;

/**
 * Builds a Better Auth instance backed by the app's SQLite/Drizzle database.
 *
 * `disableSignUp` defaults to `true` (single-owner app, signup disabled in both config and UI). The
 * seed script (scripts/seed.ts) constructs its own instance with `disableSignUp: false` to create
 * the one owner user.
 */
export function createAuth(options: { disableSignUp?: boolean } = {}) {
  return betterAuth({
    baseURL: env.BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'sqlite', schema: authSchema }),
    disabledPaths: ['/token'],
    emailAndPassword: {
      enabled: true,
      disableSignUp: options.disableSignUp ?? true,
      // A reset link may be exercised by someone who isn't the holder of the current session; drop
      // all existing sessions once the password changes.
      revokeSessionsOnPasswordReset: true,
      // With Resend configured, the sign-in page offers a reset link; without it there is no
      // outbound email and reset requests go nowhere.
      ...(mailerConfigured() &&
        ({
          sendResetPassword: async ({ user, url }) => {
            await sendEmail({
              to: user.email,
              subject: 'Reset your Exhibit password',
              text: `Reset your Exhibit password:\n\n${url}\n\nIf you didn’t request this, ignore this email.`,
            });
          },
        } satisfies Pick<EmailPasswordOptions, 'sendResetPassword'>)),
    },
    // Owner can change email/password in /settings; OWNER_EMAIL/PASSWORD are first-seed values only
    // (see seedOwner). Without a mailer there's no way to deliver a confirmation, so the change
    // applies immediately; with one, a confirmation link goes to the OLD address first.
    user: {
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: !mailerConfigured(),
        ...(mailerConfigured() &&
          ({
            sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
              await sendEmail({
                to: user.email,
                subject: 'Confirm your Exhibit email change',
                text: `Confirm changing your Exhibit email to ${newEmail}:\n\n${url}\n\nIf you didn’t request this, ignore this email.`,
              });
            },
          } satisfies Pick<ChangeEmailOptions, 'sendChangeEmailConfirmation'>)),
      },
    },
    // Rate limiting defaults to enabled only in production; force it on so dev/test behavior
    // matches prod.
    rateLimit: { enabled: true },
    // Scopes which forwarded hops are trusted for client-IP resolution (used by rateLimit above).
    // Unset keeps the default: a single-value X-Forwarded-For is trusted verbatim, which is
    // spoofable unless a trusted proxy strips inbound copies of that header.
    advanced: { ipAddress: { trustedProxies: env.TRUSTED_PROXIES } },
    plugins: [
      jwt({
        // Session payloads should not be signed when an oAuth provider plugin is present; only
        // oauth2 access/id tokens are.
        disableSettingJwtHeader: true,
        jwt: {
          // Defaults to `baseURL` + `basePath` (e.g. `.../api/auth`), which wouldn't match the
          // plain-origin `authorization_servers` entry served at
          // /.well-known/oauth-protected-resource. Pin the issuer to the bare origin so discovery
          // documents stay internally consistent; the individual oauth2/jwks endpoint URLs in the
          // metadata still correctly point under basePath.
          issuer: env.BASE_URL,
        },
      }),
      oauthProvider({
        loginPage: '/sign-in',
        consentPage: '/consent',
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        validAudiences: [env.BASE_URL, `${env.BASE_URL}/mcp`],
        // Both discovery documents are served from the issuer root by the routes in
        // src/routes/[.]well-known, so the "please ensure ... exists" warnings are satisfied.
        silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
      }),
      // Must be last: handles setting cookies via TanStack Start's response API.
      tanstackStartCookies(),
    ],
  });
}

export const auth = createAuth();
