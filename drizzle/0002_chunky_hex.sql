CREATE TABLE `monthly_inspection_buses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inspection_id` integer NOT NULL,
	`bus_id` integer NOT NULL,
	FOREIGN KEY (`inspection_id`) REFERENCES `monthly_inspections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bus_id`) REFERENCES `buses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_inspection_bus_idx` ON `monthly_inspection_buses` (`inspection_id`,`bus_id`);