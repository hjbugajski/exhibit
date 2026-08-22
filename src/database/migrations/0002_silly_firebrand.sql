CREATE TABLE `oauth_client_assertion` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_client_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`metadata` text,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resource_id`) REFERENCES `oauth_resource`(`identifier`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauthClientResource_clientId_idx` ON `oauth_client_resource` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauthClientResource_resourceId_idx` ON `oauth_client_resource` (`resource_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauthClientResource_clientId_resourceId_idx` ON `oauth_client_resource` (`client_id`,`resource_id`);--> statement-breakpoint
CREATE TABLE `oauth_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`name` text NOT NULL,
	`access_token_ttl` integer,
	`refresh_token_ttl` integer,
	`signing_algorithm` text,
	`signing_key_id` text,
	`allowed_scopes` text,
	`custom_claims` text,
	`dpop_bound_access_tokens_required` integer,
	`disabled` integer,
	`created_at` integer,
	`updated_at` integer,
	`policy_version` integer,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_resource_identifier_unique` ON `oauth_resource` (`identifier`);--> statement-breakpoint
ALTER TABLE `account` ADD `issuer` text NOT NULL DEFAULT 'local:credential';--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_accountId_idx` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
ALTER TABLE `jwks` ADD `alg` text;--> statement-breakpoint
ALTER TABLE `jwks` ADD `crv` text;--> statement-breakpoint
ALTER TABLE `oauth_access_token` ADD `authorization_code_id` text;--> statement-breakpoint
ALTER TABLE `oauth_access_token` ADD `resources` text;--> statement-breakpoint
ALTER TABLE `oauth_access_token` ADD `requested_user_info_claims` text;--> statement-breakpoint
ALTER TABLE `oauth_access_token` ADD `revoked` integer;--> statement-breakpoint
ALTER TABLE `oauth_access_token` ADD `confirmation` text;--> statement-breakpoint
CREATE INDEX `oauthAccessToken_authorizationCodeId_idx` ON `oauth_access_token` (`authorization_code_id`);--> statement-breakpoint
ALTER TABLE `oauth_client` ADD `client_discovery_id` text;--> statement-breakpoint
ALTER TABLE `oauth_client` ADD `client_credentials_scopes` text;--> statement-breakpoint
ALTER TABLE `oauth_client` ADD `backchannel_logout_uri` text;--> statement-breakpoint
ALTER TABLE `oauth_client` ADD `backchannel_logout_session_required` integer;--> statement-breakpoint
ALTER TABLE `oauth_client` ADD `application_type` text;--> statement-breakpoint
UPDATE `oauth_client` SET `application_type` = `type` WHERE `application_type` IS NULL;--> statement-breakpoint
ALTER TABLE `oauth_client` ADD `jwks` text;--> statement-breakpoint
ALTER TABLE `oauth_client` ADD `jwks_uri` text;--> statement-breakpoint
ALTER TABLE `oauth_client` ADD `dpop_bound_access_tokens` integer;--> statement-breakpoint
ALTER TABLE `oauth_consent` ADD `resources` text;--> statement-breakpoint
ALTER TABLE `oauth_consent` ADD `requested_user_info_claims` text;--> statement-breakpoint
ALTER TABLE `oauth_refresh_token` ADD `authorization_code_id` text;--> statement-breakpoint
ALTER TABLE `oauth_refresh_token` ADD `resources` text;--> statement-breakpoint
ALTER TABLE `oauth_refresh_token` ADD `requested_user_info_claims` text;--> statement-breakpoint
ALTER TABLE `oauth_refresh_token` ADD `rotated_at` integer;--> statement-breakpoint
ALTER TABLE `oauth_refresh_token` ADD `rotation_replay_response` text;--> statement-breakpoint
ALTER TABLE `oauth_refresh_token` ADD `rotation_replay_expires_at` integer;--> statement-breakpoint
ALTER TABLE `oauth_refresh_token` ADD `confirmation` text;--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_authorizationCodeId_idx` ON `oauth_refresh_token` (`authorization_code_id`);