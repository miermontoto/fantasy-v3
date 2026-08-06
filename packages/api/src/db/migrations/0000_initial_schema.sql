CREATE TABLE `auth_token` (
	`community_id` text PRIMARY KEY NOT NULL,
	`xauth` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `balance_movement` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` text NOT NULL,
	`ts` integer NOT NULL,
	`type` text NOT NULL,
	`reason` text NOT NULL,
	`amount` integer NOT NULL,
	`balance` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `balance_movement_ts_reason_uq` ON `balance_movement` (`ts`,`reason`,`amount`);--> statement-breakpoint
CREATE TABLE `clause_change` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` text NOT NULL,
	`ts` integer NOT NULL,
	`kind` text NOT NULL,
	`owner_id` text,
	`prev_owner_id` text,
	`old_clause` integer,
	`new_clause` integer,
	`value` integer,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `clause_change_ts_idx` ON `clause_change` (`ts`);--> statement-breakpoint
CREATE INDEX `clause_change_player_idx` ON `clause_change` (`player_id`);--> statement-breakpoint
CREATE TABLE `community` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`competition_id` integer,
	`start_budget` integer DEFAULT 200000000 NOT NULL,
	`reset_at` integer,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gameweek` (
	`id` integer PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`season` text NOT NULL,
	`status` text NOT NULL,
	`first_match_at` integer,
	`last_match_at` integer
);
--> statement-breakpoint
CREATE TABLE `manager` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`name` text NOT NULL,
	`is_self` integer DEFAULT false NOT NULL,
	`initial_cash` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `manager_community_idx` ON `manager` (`community_id`);--> statement-breakpoint
CREATE TABLE `manager_alias` (
	`alias` text PRIMARY KEY NOT NULL,
	`manager_id` text NOT NULL,
	FOREIGN KEY (`manager_id`) REFERENCES `manager`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `manager_alias_manager_idx` ON `manager_alias` (`manager_id`);--> statement-breakpoint
CREATE TABLE `manager_snapshot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`manager_id` text NOT NULL,
	`ts` integer NOT NULL,
	`cash` integer NOT NULL,
	`team_value` integer NOT NULL,
	`max_bid` integer NOT NULL,
	`clause_spend` integer DEFAULT 0 NOT NULL,
	`pending_bids` integer DEFAULT 0 NOT NULL,
	`exact` integer DEFAULT false NOT NULL,
	`points` integer,
	`position` integer,
	FOREIGN KEY (`manager_id`) REFERENCES `manager`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `manager_snapshot_manager_ts_idx` ON `manager_snapshot` (`manager_id`,`ts`);--> statement-breakpoint
CREATE TABLE `player` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`team_id` integer,
	`photo_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `player_snapshot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` text NOT NULL,
	`community_id` text NOT NULL,
	`ts` integer NOT NULL,
	`value` integer NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`average` real DEFAULT 0 NOT NULL,
	`owner_id` text,
	`clause` integer,
	`clause_multiplier` real,
	`shield` integer DEFAULT 0 NOT NULL,
	`listed` integer DEFAULT false NOT NULL,
	`clauses_rank` integer,
	FOREIGN KEY (`player_id`) REFERENCES `player`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `player_snapshot_player_ts_idx` ON `player_snapshot` (`player_id`,`ts`);--> statement-breakpoint
CREATE INDEX `player_snapshot_owner_idx` ON `player_snapshot` (`owner_id`);--> statement-breakpoint
CREATE TABLE `poller_state` (
	`poller` text PRIMARY KEY NOT NULL,
	`last_run_at` integer,
	`last_ok_at` integer,
	`cursor` text,
	`failures` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `transfer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` text NOT NULL,
	`feed_id` integer NOT NULL,
	`player_id` text NOT NULL,
	`player_name` text NOT NULL,
	`from_manager_id` text,
	`to_manager_id` text,
	`price` integer NOT NULL,
	`kind` text DEFAULT 'market' NOT NULL,
	`source` text NOT NULL,
	`occurred_at` integer,
	`seen_at` integer NOT NULL,
	`baseline` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfer_feed_player_uq` ON `transfer` (`feed_id`,`player_id`);--> statement-breakpoint
CREATE INDEX `transfer_seen_idx` ON `transfer` (`seen_at`);