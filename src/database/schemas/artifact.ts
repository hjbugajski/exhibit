import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    type: text('type').notNull(),
    tags: text('tags', { mode: 'json' }).$type<string[]>(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    archivedAt: integer('archived_at'),
    deletedAt: integer('deleted_at'),
  },
  (table) => [
    check('type_check', sql`${table.type} in ('spec', 'html', 'markdown')`),
    // Covers listArtifacts' default/updated/created sorts; the lower(title) sort runs unindexed
    // by decision (docs/plans/README.md, "Considered and rejected").
    index('artifact_deletedAt_updatedAt_id_idx').on(table.deletedAt, table.updatedAt, table.id),
    index('artifact_deletedAt_createdAt_id_idx').on(table.deletedAt, table.createdAt, table.id),
  ],
);
