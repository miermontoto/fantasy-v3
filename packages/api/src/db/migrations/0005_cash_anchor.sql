CREATE TABLE `cash_anchor` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`manager_id` text NOT NULL,
	`ts` integer NOT NULL,
	`cash` integer NOT NULL,
	`source` text NOT NULL,
	`note` text,
	FOREIGN KEY (`manager_id`) REFERENCES `manager`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cash_anchor_manager_ts_idx` ON `cash_anchor` (`manager_id`,`ts`);