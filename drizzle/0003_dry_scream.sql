CREATE TABLE `checklist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`category` text NOT NULL,
	`content` text NOT NULL,
	`responsible_role` text DEFAULT 'all' NOT NULL,
	`sort_order` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_items_code_idx` ON `checklist_items` (`code`);