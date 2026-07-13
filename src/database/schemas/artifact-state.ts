import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { artifacts } from '@/database/schemas/artifact';

/**
 * Interaction state for stateful spec components (e.g. Checklist statePath checkboxes): one JSON
 * state model per artifact, keyed per artifact (not per version) — state paths are authored in the
 * spec, so they carry across version bumps.
 */
export const artifactStates = sqliteTable('artifact_states', {
  artifactId: text('artifact_id')
    .primaryKey()
    .references(() => artifacts.id, { onDelete: 'cascade' }),
  state: text('state', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  updatedAt: integer('updated_at').notNull(),
});
