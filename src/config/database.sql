CREATE DATABASE IF NOT EXISTS `wa_bot_internal`;

USE `wa_bot_internal`;

CREATE TABLE IF NOT EXISTS `chats` (
    `id` int NOT NULL AUTO_INCREMENT,
    `phone_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
    `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
    `response` text COLLATE utf8mb4_unicode_ci,
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    `is_sent` boolean DEFAULT false,
    `error_message` text COLLATE utf8mb4_unicode_ci,
    PRIMARY KEY (`id`),
    KEY `idx_phone_number` (`phone_number`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `persons` (
    `person_id` varchar(255) NOT NULL,
    `phone_number` varchar(32) NULL,
    `email_address` varchar(255) NULL,
    PRIMARY KEY (`person_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `todolist` (
    `id` int NOT NULL AUTO_INCREMENT,
    `todo` varchar(255) NULL,
    `person_id` varchar(255) NULL,
    `created_at` datetime NULL,
    `due_date` datetime NULL,
    `completed_at` datetime NULL,
    `is_completed` tinyint (1) NULL,
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
