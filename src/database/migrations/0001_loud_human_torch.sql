PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`tags` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	`deleted_at` integer,
	CONSTRAINT "type_check" CHECK("__new_artifacts"."type" in ('spec', 'html', 'markdown'))
);
--> statement-breakpoint
INSERT INTO `__new_artifacts`("id", "title", "description", "type", "tags", "created_at", "updated_at", "archived_at", "deleted_at") SELECT "id", "title", "description", "type", "tags", "created_at", "updated_at", "archived_at", "deleted_at" FROM `artifacts`;--> statement-breakpoint
DROP TABLE `artifacts`;--> statement-breakpoint
ALTER TABLE `__new_artifacts` RENAME TO `artifacts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `artifact_deletedAt_updatedAt_id_idx` ON `artifacts` (`deleted_at`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `artifact_deletedAt_createdAt_id_idx` ON `artifacts` (`deleted_at`,`created_at`,`id`);