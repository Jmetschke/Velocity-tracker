CREATE TABLE `product_launches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`productName` text NOT NULL,
	`codename` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_launch_checklist_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`productLaunchId` integer NOT NULL,
	`stageNumber` integer NOT NULL,
	`stageName` text NOT NULL,
	`taskText` text NOT NULL,
	`isComplete` integer DEFAULT false NOT NULL,
	`completedAt` integer,
	`notes` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
