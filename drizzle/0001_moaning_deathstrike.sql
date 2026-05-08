CREATE TABLE `inventory_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`snapshotId` int NOT NULL,
	`skuId` int NOT NULL,
	`qtyInInventory` int DEFAULT 0,
	`qtyOnHold` int DEFAULT 0,
	`totalQty` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadedBy` int,
	`fileName` varchar(512),
	`snapshotDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `production_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skuId` int NOT NULL,
	`batchSize` int NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`status` enum('suggested','scheduled','in_progress','completed','cancelled') DEFAULT 'suggested',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `production_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadedBy` int,
	`fileName` varchar(512),
	`status` enum('pending','processing','completed','failed') DEFAULT 'pending',
	`aiAnalysis` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sales_uploads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sku_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`theoreticalBatchSize` int NOT NULL,
	`lossPercent` decimal(5,2) NOT NULL DEFAULT '5.00',
	`netBatchSize` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sku_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `skus` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`categoryId` int NOT NULL,
	`dailyVelocity` decimal(10,2) DEFAULT '0',
	`velocitySource` enum('manual','ai','calculated') DEFAULT 'manual',
	`parLevel` int DEFAULT 0,
	`bufferDays` int DEFAULT 14,
	`leadTimeDays` int DEFAULT 5,
	`customBatchSize` int,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `skus_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `velocity_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skuId` int NOT NULL,
	`dailyVelocity` decimal(10,2) NOT NULL,
	`source` enum('manual','ai','calculated') DEFAULT 'calculated',
	`salesUploadId` int,
	`notes` text,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `velocity_history_id` PRIMARY KEY(`id`)
);
