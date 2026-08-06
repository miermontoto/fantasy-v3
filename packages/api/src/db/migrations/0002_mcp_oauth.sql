CREATE TABLE `mcp_oauth_access_token` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`client_id` text NOT NULL,
	`scope` text NOT NULL,
	`resource` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_access_expires` ON `mcp_oauth_access_token` (`expires_at`);--> statement-breakpoint
CREATE TABLE `mcp_oauth_client` (
	`client_id` text PRIMARY KEY NOT NULL,
	`name` text,
	`redirect_uris_json` text NOT NULL,
	`grant_types_json` text NOT NULL,
	`token_endpoint_auth_method` text DEFAULT 'none' NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `mcp_oauth_code` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`client_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`code_challenge_method` text NOT NULL,
	`resource` text,
	`scope` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_code_expires` ON `mcp_oauth_code` (`expires_at`);--> statement-breakpoint
CREATE TABLE `mcp_oauth_refresh_token` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`client_id` text NOT NULL,
	`scope` text NOT NULL,
	`resource` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`replaced_by_hash` text,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_refresh_expires` ON `mcp_oauth_refresh_token` (`expires_at`);