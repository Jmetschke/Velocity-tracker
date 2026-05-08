CREATE TABLE `notification_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`skuId` int NOT NULL,
	`currentStock` int NOT NULL,
	`daysUntilStockout` decimal(8,2) NOT NULL,
	`dailyVelocity` decimal(10,2) NOT NULL,
	`notificationType` enum('stockout_warning','critical_alert') NOT NULL,
	`emailSent` boolean DEFAULT false,
	`emailSentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stockoutThresholdDays` int NOT NULL DEFAULT 7,
	`emailEnabled` boolean NOT NULL DEFAULT true,
	`notificationFrequency` enum('immediate','daily','weekly') NOT NULL DEFAULT 'daily',
	`lastNotificationSentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_settings_id` PRIMARY KEY(`id`)
);
