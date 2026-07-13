import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { artifacts } from '@/database/schemas/artifact';

export const artifactVersions = sqliteTable(
  'artifact_versions',
  {
    id: text('id').primaryKey(),
    artifactId: text('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [unique('artifact_version_unique').on(table.artifactId, table.version)],
);
