CREATE TABLE `announcements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`author_id` integer,
	`audience` text DEFAULT 'all' NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`expires_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meeting_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`status` text DEFAULT 'absent' NOT NULL,
	`note` text,
	`recorded_by_id` integer,
	`recorded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_meeting_member_uq` ON `attendance` (`meeting_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `attendance_member_idx` ON `attendance` (`member_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` integer,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`summary` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `chair_holders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chair_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`term_start` text NOT NULL,
	`term_end` text,
	`title` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`chair_id`) REFERENCES `chairs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chair_holders_chair_idx` ON `chair_holders` (`chair_id`);--> statement-breakpoint
CREATE INDEX `chair_holders_member_idx` ON `chair_holders` (`member_id`);--> statement-breakpoint
CREATE TABLE `chairs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'internal' NOT NULL,
	`description` text,
	`responsibilities` text,
	`is_exec` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chairs_slug_unique` ON `chairs` (`slug`);--> statement-breakpoint
CREATE TABLE `charges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`period_id` integer,
	`kind` text DEFAULT 'dues' NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`due_date` text,
	`sanction_id` integer,
	`created_by_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`period_id`) REFERENCES `dues_periods`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sanction_id`) REFERENCES `sanctions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `charges_member_idx` ON `charges` (`member_id`);--> statement-breakpoint
CREATE INDEX `charges_period_idx` ON `charges` (`period_id`);--> statement-breakpoint
CREATE TABLE `dues_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`new_member_amount_cents` integer,
	`due_date` text NOT NULL,
	`late_fee_cents` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dues_periods_name_unique` ON `dues_periods` (`name`);--> statement-breakpoint
CREATE TABLE `event_duties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`member_id` integer,
	`duty` text DEFAULT 'other' NOT NULL,
	`label` text,
	`starts_at` text,
	`ends_at` text,
	`status` text DEFAULT 'assigned' NOT NULL,
	`completed_at` text,
	`notes` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `event_duties_event_idx` ON `event_duties` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_duties_member_idx` ON `event_duties` (`member_id`);--> statement-breakpoint
CREATE TABLE `event_rsvps` (
	`event_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`status` text DEFAULT 'going' NOT NULL,
	`guests` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`event_id`, `member_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`location` text,
	`description` text,
	`chair_id` integer,
	`created_by_id` integer,
	`is_mandatory` integer DEFAULT false NOT NULL,
	`rsvp_enabled` integer DEFAULT true NOT NULL,
	`budget_cents` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`chair_id`) REFERENCES `chairs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `events_starts_idx` ON `events` (`starts_at`);--> statement-breakpoint
CREATE TABLE `excuse_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`meeting_id` integer,
	`assignment_id` integer,
	`event_id` integer,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by_id` integer,
	`reviewed_at` text,
	`review_note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `job_assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `job_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_id` integer NOT NULL,
	`job_type_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`slot` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'assigned' NOT NULL,
	`completed_at` text,
	`verified_by_id` integer,
	`verified_at` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`week_id`) REFERENCES `labor_weeks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_type_id`) REFERENCES `job_types`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`verified_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_assignments_week_job_slot_uq` ON `job_assignments` (`week_id`,`job_type_id`,`slot`);--> statement-breakpoint
CREATE INDEX `job_assignments_member_idx` ON `job_assignments` (`member_id`);--> statement-breakpoint
CREATE INDEX `job_assignments_week_idx` ON `job_assignments` (`week_id`);--> statement-breakpoint
CREATE TABLE `job_swap_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assignment_id` integer NOT NULL,
	`requested_by_id` integer NOT NULL,
	`target_member_id` integer,
	`reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_by_id` integer,
	`resolved_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `job_assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `job_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'clean' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`window_label` text,
	`start_offset_days` integer DEFAULT 0 NOT NULL,
	`due_offset_days` integer DEFAULT 7 NOT NULL,
	`slots` integer DEFAULT 1 NOT NULL,
	`points` integer DEFAULT 1 NOT NULL,
	`instructions` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `labor_weeks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start` text NOT NULL,
	`is_published` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_by_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `labor_weeks_week_start_unique` ON `labor_weeks` (`week_start`);--> statement-breakpoint
CREATE TABLE `maintenance_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`location` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reported_by_id` integer,
	`assigned_to_id` integer,
	`resolved_at` text,
	`resolution_notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`reported_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_to_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT 'house' NOT NULL,
	`scheduled_at` text NOT NULL,
	`location` text,
	`agenda` text,
	`minutes` text,
	`is_mandatory` integer DEFAULT true NOT NULL,
	`attendance_taken` integer DEFAULT false NOT NULL,
	`created_by_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `meetings_scheduled_idx` ON `meetings` (`scheduled_at`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`preferred_name` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`labor_group` text DEFAULT 'none' NOT NULL,
	`pledge_class_id` integer,
	`email` text,
	`phone` text,
	`room` text,
	`lives_in_house` integer DEFAULT true NOT NULL,
	`major` text,
	`grad_year` integer,
	`birthday` text,
	`emergency_contact` text,
	`dietary_notes` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`pledge_class_id`) REFERENCES `pledge_classes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_username_unique` ON `members` (`username`);--> statement-breakpoint
CREATE INDEX `members_last_name_idx` ON `members` (`last_name`);--> statement-breakpoint
CREATE INDEX `members_status_idx` ON `members` (`status`);--> statement-breakpoint
CREATE TABLE `payment_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`period_id` integer,
	`installments_json` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`approved_by_id` integer,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`period_id`) REFERENCES `dues_periods`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`period_id` integer,
	`amount_cents` integer NOT NULL,
	`method` text DEFAULT 'venmo' NOT NULL,
	`reference` text,
	`paid_at` text NOT NULL,
	`recorded_by_id` integer,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`period_id`) REFERENCES `dues_periods`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recorded_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `payments_member_idx` ON `payments` (`member_id`);--> statement-breakpoint
CREATE INDEX `payments_period_idx` ON `payments` (`period_id`);--> statement-breakpoint
CREATE TABLE `pledge_classes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`semester_label` text,
	`notes` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pledge_classes_name_unique` ON `pledge_classes` (`name`);--> statement-breakpoint
CREATE TABLE `sanctions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`issued_by_id` integer,
	`reason` text NOT NULL,
	`job_description` text,
	`hours` integer,
	`fine_cents` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_ref` text,
	`issued_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`due_at` text,
	`status` text DEFAULT 'open' NOT NULL,
	`completed_at` text,
	`verified_by_id` integer,
	`verified_at` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issued_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`verified_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sanctions_member_idx` ON `sanctions` (`member_id`);--> statement-breakpoint
CREATE INDEX `sanctions_status_idx` ON `sanctions` (`status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_member_idx` ON `sessions` (`member_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`member_id` integer,
	`type` text DEFAULT 'comment' NOT NULL,
	`body` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `task_activity_task_idx` ON `task_activity` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_assignees` (
	`task_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`assigned_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`task_id`, `member_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_assignees_member_idx` ON `task_assignees` (`member_id`);--> statement-breakpoint
CREATE TABLE `task_checklist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`label` text NOT NULL,
	`is_done` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`chair_id` integer,
	`created_by_id` integer,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`due_at` text,
	`started_at` text,
	`completed_at` text,
	`completed_by_id` integer,
	`recurrence` text DEFAULT 'none' NOT NULL,
	`tags` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`chair_id`) REFERENCES `chairs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`completed_by_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_chair_idx` ON `tasks` (`chair_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_due_idx` ON `tasks` (`due_at`);