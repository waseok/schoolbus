CREATE TABLE `login_throttles` (
	`username` text PRIMARY KEY NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`window_started_at` text NOT NULL
);
