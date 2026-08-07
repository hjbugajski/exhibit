import { definePlugin } from 'nitro';

/**
 * Migrations run at import time as a side effect of loading this module (seed.ts ->
 * database/index.ts calls `migrate()` at the top level) and must complete before the server accepts
 * requests. Imported directly — and eagerly, not lazily — so that never becomes accidental: any
 * change that makes the seed import lazy (e.g. a dynamic `import()` deferred past boot) would
 * silently drop this guarantee.
 */
import '../database/index.ts';
/**
 * Relative imports (see src/lib/auth.ts) keep the seed module free of the `@/*` alias; this file
 * itself is bundled by Nitro, which does resolve it, but staying consistent costs nothing.
 */
import { env } from './env.ts';
import { seedOwner, syncOwnerEmailVerified } from './seed.ts';

/**
 * Creates the owner account at server boot when OWNER_EMAIL/OWNER_PASSWORD are set, so a fresh
 * `docker compose up` works without a manual seed step (the runtime image ships only the Nitro
 * bundle — `pnpm seed` needs a full source checkout). Idempotent; Nitro plugin functions must be
 * synchronous, so the async work is fire-and-forget.
 */
export default definePlugin(() => {
  // Re-syncs the flag on every boot: mailer added → verified (or /change-email downgrades to
  // verifying the NEW address), mailer dropped → unverified (or /change-email 400s outright); see
  // seed.ts. Deliberately ahead of the OWNER_* guard below — a deployment that dropped those vars
  // after its first boot still needs the sync.
  syncOwnerEmailVerified();

  const email = env.OWNER_EMAIL;
  const password = env.OWNER_PASSWORD;

  if (!email || !password) {
    return;
  }

  seedOwner(email, password).then(
    ({ created }) => {
      if (created) {
        console.log(`Created owner user ${email}`);
      }
    },
    (error: unknown) => {
      console.error('Failed to seed owner user:', error);
    },
  );
});
