CREATE TABLE `llm_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(128),
	`action` varchar(128) NOT NULL,
	`model` varchar(128),
	`promptTokens` int DEFAULT 0,
	`completionTokens` int DEFAULT 0,
	`totalTokens` int DEFAULT 0,
	`durationMs` int DEFAULT 0,
	`success` boolean NOT NULL DEFAULT true,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `llm_usage_id` PRIMARY KEY(`id`)
);
