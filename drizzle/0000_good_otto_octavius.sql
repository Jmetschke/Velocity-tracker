CREATE TABLE `committed_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`skuId` integer NOT NULL,
	`quantity` integer NOT NULL,
	`calendarWeek` integer NOT NULL,
	`calendarYear` integer NOT NULL,
	`startDate` integer,
	`endDate` integer,
	`status` text DEFAULT 'planned',
	`notes` text,
	`createdBy` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshotId` integer NOT NULL,
	`skuId` integer NOT NULL,
	`qtyInInventory` integer DEFAULT 0,
	`qtyOnHold` integer DEFAULT 0,
	`totalQty` integer DEFAULT 0,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inventory_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uploadedBy` integer,
	`fileName` text,
	`snapshotDate` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `llm_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` text,
	`action` text NOT NULL,
	`model` text,
	`promptTokens` integer DEFAULT 0,
	`completionTokens` integer DEFAULT 0,
	`totalTokens` integer DEFAULT 0,
	`durationMs` integer DEFAULT 0,
	`success` integer DEFAULT true NOT NULL,
	`errorMessage` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`skuId` integer NOT NULL,
	`currentStock` integer NOT NULL,
	`daysUntilStockout` real NOT NULL,
	`dailyVelocity` real NOT NULL,
	`notificationType` text NOT NULL,
	`emailSent` integer DEFAULT false,
	`emailSentAt` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`stockoutThresholdDays` integer DEFAULT 7 NOT NULL,
	`emailEnabled` integer DEFAULT true NOT NULL,
	`notificationFrequency` text DEFAULT 'daily' NOT NULL,
	`lastNotificationSentAt` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `production_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`skuId` integer NOT NULL,
	`batchSize` integer NOT NULL,
	`startDate` integer NOT NULL,
	`endDate` integer NOT NULL,
	`status` text DEFAULT 'suggested',
	`notes` text,
	`createdBy` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sales_uploads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uploadedBy` integer,
	`fileName` text,
	`status` text DEFAULT 'pending',
	`aiAnalysis` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sku_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`theoreticalBatchSize` integer NOT NULL,
	`lossPercent` real DEFAULT 5 NOT NULL,
	`netBatchSize` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skus` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`categoryId` integer NOT NULL,
	`dailyVelocity` real DEFAULT 0,
	`velocitySource` text DEFAULT 'manual',
	`parLevel` integer DEFAULT 0,
	`bufferDays` integer DEFAULT 14,
	`leadTimeDays` integer DEFAULT 5,
	`customBatchSize` integer,
	`isActive` integer DEFAULT true,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	`lastSignedIn` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE TABLE `velocity_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`skuId` integer NOT NULL,
	`dailyVelocity` real NOT NULL,
	`source` text DEFAULT 'calculated',
	`salesUploadId` integer,
	`notes` text,
	`recordedAt` integer DEFAULT (unixepoch()) NOT NULL
);
