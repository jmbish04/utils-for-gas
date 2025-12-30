CREATE TABLE `ai_transcripts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cf_request_id` text NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	`model` text NOT NULL,
	`prompt` text NOT NULL,
	`response` text NOT NULL,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`total_tokens` integer,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `doc_operations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`durable_object_id` text NOT NULL,
	`doc_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`error_message` text,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	`duration_ms` integer
);
--> statement-breakpoint
CREATE TABLE `gmail_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`from` text NOT NULL,
	`to` text,
	`cc` text,
	`subject` text,
	`snippet` text,
	`body_preview` text,
	`internal_date` integer,
	`received_date` integer,
	`processed_at` integer,
	`processed_by` text,
	`embedding` text,
	`vectorize_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gmail_messages_message_id_unique` ON `gmail_messages` (`message_id`);--> statement-breakpoint
CREATE TABLE `gmail_threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` text NOT NULL,
	`subject` text NOT NULL,
	`snippet` text,
	`first_message_date` integer,
	`last_message_date` integer,
	`processed_at` integer,
	`processed_by` text,
	`labels` text,
	`embedding` text,
	`vectorize_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gmail_threads_thread_id_unique` ON `gmail_threads` (`thread_id`);--> statement-breakpoint
CREATE TABLE `system_prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`content` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`tags` text,
	`category` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_prompts_name_unique` ON `system_prompts` (`name`);--> statement-breakpoint
CREATE TABLE `telemetry_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cf_request_id` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	`appsscript_id` text DEFAULT '' NOT NULL,
	`appsscript_name` text DEFAULT '' NOT NULL,
	`appsscript_drive_id` text DEFAULT '' NOT NULL,
	`appsscript_drive_url` text DEFAULT '' NOT NULL,
	`appsscript_editor_url` text DEFAULT '' NOT NULL,
	`duration_ms` integer,
	`status_code` integer
);
