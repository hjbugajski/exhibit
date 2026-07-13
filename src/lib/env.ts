import { z } from 'zod';

/**
 * Parsed once at import time so a misconfigured deployment fails at boot, not on the first request
 * that happens to need a variable. Imported via relative paths from the seed chain (see
 * src/lib/auth.ts) so plain `node` can execute it.
 */

const envSchema = z
  .object({
    /** Public origin; also the OAuth issuer/audience. */
    BASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    DATABASE_PATH: z.string().min(1).default('./data/app.db'),
    MIGRATIONS_PATH: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1).optional(),
    OWNER_EMAIL: z.string().min(1).optional(),
    OWNER_PASSWORD: z.string().min(1).optional(),
    /** Comma-separated IPs/CIDRs; unset trusts single-value X-Forwarded-For verbatim. */
    TRUSTED_PROXIES: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      )
      .optional(),
  })
  .refine((vars) => Boolean(vars.RESEND_API_KEY) === Boolean(vars.EMAIL_FROM), {
    message: 'RESEND_API_KEY and EMAIL_FROM must be set together',
    path: ['RESEND_API_KEY'],
  })
  .refine((vars) => Boolean(vars.OWNER_EMAIL) === Boolean(vars.OWNER_PASSWORD), {
    message: 'OWNER_EMAIL and OWNER_PASSWORD must be set together',
    path: ['OWNER_EMAIL'],
  });

/** compose.yaml passes optional vars as `${VAR:-}` — treat '' as unset. */
function withoutEmpty(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
}

const parsed = envSchema.safeParse(withoutEmpty(process.env));

if (!parsed.success) {
  throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
