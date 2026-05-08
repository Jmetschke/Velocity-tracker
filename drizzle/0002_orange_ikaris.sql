CREATE TABLE `committed_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skuId` int NOT NULL,
	`quantity` int NOT NULL,
	`calendarWeek` int NOT NULL,
	`calendarYear` int NOT NULL,
	`startDate` timestamp,
	`endDate` timestamp,
	`status` enum('planned','in_progress','completed','cancelled') DEFAULT 'planned',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `committed_batches_id` PRIMARY KEY(`id`)
);
