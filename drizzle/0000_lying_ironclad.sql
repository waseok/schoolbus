CREATE TABLE `app_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text,
	`role` text NOT NULL,
	`pin_salt` text NOT NULL,
	`pin_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_username_idx` ON `app_users` (`username`);--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`bus_id` integer NOT NULL,
	`stop_name` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bus_id`) REFERENCES `buses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `boarding_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`daily_run_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`boarded` integer DEFAULT false NOT NULL,
	`note` text,
	FOREIGN KEY (`daily_run_id`) REFERENCES `daily_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `boarding_unique_idx` ON `boarding_records` (`daily_run_id`,`student_id`);--> statement-breakpoint
CREATE TABLE `buses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bus_number` integer NOT NULL,
	`plate_number` text,
	`driver_name` text,
	`attendant_name` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `buses_number_idx` ON `buses` (`bus_number`);--> statement-breakpoint
CREATE TABLE `calendar_exclusions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_date_idx` ON `calendar_exclusions` (`date`);--> statement-breakpoint
CREATE TABLE `daily_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bus_id` integer NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`note` text,
	FOREIGN KEY (`bus_id`) REFERENCES `buses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_runs_unique_idx` ON `daily_runs` (`bus_id`,`date`);--> statement-breakpoint
CREATE TABLE `inspection_group_buses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`bus_id` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `inspection_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bus_id`) REFERENCES `buses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inspection_group_bus_idx` ON `inspection_group_buses` (`group_id`,`bus_id`);--> statement-breakpoint
CREATE TABLE `inspection_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inspection_responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inspection_id` integer NOT NULL,
	`item_code` text NOT NULL,
	`answer` text NOT NULL,
	`note` text,
	FOREIGN KEY (`inspection_id`) REFERENCES `monthly_inspections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inspection_response_idx` ON `inspection_responses` (`inspection_id`,`item_code`);--> statement-breakpoint
CREATE TABLE `monthly_inspections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`bus_id` integer,
	`group_id` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`submitted_at` text,
	FOREIGN KEY (`bus_id`) REFERENCES `buses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `inspection_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_group_inspection_idx` ON `monthly_inspections` (`month`,`group_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`grade` integer NOT NULL,
	`class_name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_bus_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`bus_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bus_id`) REFERENCES `buses`(`id`) ON UPDATE no action ON DELETE no action
);
