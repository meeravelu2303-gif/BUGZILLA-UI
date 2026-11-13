-- =============================================================================
-- Bugzilla database "bugs" - STRUCTURE ONLY (no data)
-- =============================================================================
-- Every table with its columns, data types, defaults, keys, indexes and
-- foreign keys, exactly as the live database defines them.
--
-- Source : MariaDB 10.11.19-MariaDB-log on 127.0.0.1:3307, database `bugs`
--          (Bugzilla 5.2 at C:\Bugzilla)
-- Created: 2026-10-24 with mariadb-dump --no-data
-- Contains NO bug data, users or passwords.
--
-- Regenerate: run this command from Git Bash -
--   "/c/Program Files/MariaDB 10.11/bin/mariadb-dump.exe" -ubugs -p -h127.0.0.1 -P3307 --no-data bugs
--
-- Tables (77):
--   attachments                        11 columns
--   attach_data                         2 columns
--   audit_log                           7 columns
--   bugs                               28 columns
--   bugs_activity                       9 columns
--   bugs_aliases                        2 columns
--   bugs_fulltext                       4 columns
--   bug_group_map                       2 columns
--   bug_see_also                        4 columns
--   bug_severity                        5 columns
--   bug_status                          6 columns
--   bug_tag                             2 columns
--   bug_user_last_visit                 4 columns
--   bz_schema                           2 columns
--   category_group_map                  2 columns
--   cc                                  2 columns
--   cf_subcomponent                     5 columns
--   classifications                     4 columns
--   components                          7 columns
--   component_cc                        2 columns
--   dependencies                        2 columns
--   duplicates                          2 columns
--   email_bug_ignore                    2 columns
--   email_setting                       3 columns
--   fielddefs                          16 columns
--   field_visibility                    2 columns
--   flagexclusions                      3 columns
--   flaginclusions                      3 columns
--   flags                               9 columns
--   flagtypes                          12 columns
--   groups                              7 columns
--   group_control_map                   9 columns
--   group_group_map                     3 columns
--   keyworddefs                         3 columns
--   keywords                            2 columns
--   logincookies                        4 columns
--   login_failure                       3 columns
--   longdescs                          10 columns
--   longdescs_tags                      3 columns
--   longdescs_tags_activity             7 columns
--   longdescs_tags_weights              3 columns
--   mail_staging                        2 columns
--   milestones                          5 columns
--   namedqueries                        4 columns
--   namedqueries_link_in_footer         2 columns
--   namedquery_group_map                2 columns
--   op_sys                              5 columns
--   priority                            5 columns
--   products                            7 columns
--   profiles                           10 columns
--   profiles_activity                   7 columns
--   profile_search                      4 columns
--   profile_setting                     3 columns
--   quips                               4 columns
--   reports                             4 columns
--   rep_platform                        5 columns
--   resolution                          5 columns
--   series                              8 columns
--   series_categories                   2 columns
--   series_data                         3 columns
--   setting                             4 columns
--   setting_value                       3 columns
--   status_workflow                     3 columns
--   tag                                 3 columns
--   tokens                              5 columns
--   ts_error                            4 columns
--   ts_exitstatus                       5 columns
--   ts_funcmap                          2 columns
--   ts_job                              9 columns
--   ts_note                             3 columns
--   user_api_keys                       6 columns
--   user_group_map                      4 columns
--   versions                            4 columns
--   watch                               2 columns
--   whine_events                        5 columns
--   whine_queries                       6 columns
--   whine_schedules                     7 columns
-- =============================================================================

/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.19-MariaDB, for Win64 (AMD64)
--
-- Host: 127.0.0.1    Database: bugs
-- ------------------------------------------------------
-- Server version	10.11.19-MariaDB-log
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `attach_data`
--

DROP TABLE IF EXISTS `attach_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `attach_data` (
  `id` mediumint(9) NOT NULL,
  `thedata` longblob NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_attach_data_id_attachments_attach_id` FOREIGN KEY (`id`) REFERENCES `attachments` (`attach_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci MAX_ROWS=100000 AVG_ROW_LENGTH=1000000 ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `attachments`
--

DROP TABLE IF EXISTS `attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `attachments` (
  `attach_id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `bug_id` mediumint(9) NOT NULL,
  `creation_ts` datetime NOT NULL,
  `modification_time` datetime NOT NULL,
  `description` tinytext NOT NULL,
  `mimetype` tinytext NOT NULL,
  `ispatch` tinyint(4) NOT NULL DEFAULT 0,
  `filename` varchar(255) NOT NULL,
  `submitter_id` mediumint(9) NOT NULL,
  `isobsolete` tinyint(4) NOT NULL DEFAULT 0,
  `isprivate` tinyint(4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`attach_id`),
  KEY `attachments_bug_id_idx` (`bug_id`),
  KEY `attachments_creation_ts_idx` (`creation_ts`),
  KEY `attachments_modification_time_idx` (`modification_time`),
  KEY `attachments_submitter_id_idx` (`submitter_id`,`bug_id`),
  CONSTRAINT `fk_attachments_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_attachments_submitter_id_profiles_userid` FOREIGN KEY (`submitter_id`) REFERENCES `profiles` (`userid`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `user_id` mediumint(9) DEFAULT NULL,
  `class` varchar(255) NOT NULL,
  `object_id` int(11) NOT NULL,
  `field` varchar(64) NOT NULL,
  `removed` mediumtext DEFAULT NULL,
  `added` mediumtext DEFAULT NULL,
  `at_time` datetime NOT NULL,
  KEY `audit_log_class_idx` (`class`,`at_time`),
  KEY `fk_audit_log_user_id_profiles_userid` (`user_id`),
  CONSTRAINT `fk_audit_log_user_id_profiles_userid` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`userid`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bug_group_map`
--

DROP TABLE IF EXISTS `bug_group_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bug_group_map` (
  `bug_id` mediumint(9) NOT NULL,
  `group_id` mediumint(9) NOT NULL,
  UNIQUE KEY `bug_group_map_bug_id_idx` (`bug_id`,`group_id`),
  KEY `bug_group_map_group_id_idx` (`group_id`),
  CONSTRAINT `fk_bug_group_map_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bug_group_map_group_id_groups_id` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bug_see_also`
--

DROP TABLE IF EXISTS `bug_see_also`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bug_see_also` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `bug_id` mediumint(9) NOT NULL,
  `value` varchar(255) NOT NULL,
  `class` varchar(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `bug_see_also_bug_id_idx` (`bug_id`,`value`),
  CONSTRAINT `fk_bug_see_also_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bug_severity`
--

DROP TABLE IF EXISTS `bug_severity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bug_severity` (
  `id` smallint(6) NOT NULL AUTO_INCREMENT,
  `value` varchar(64) NOT NULL,
  `sortkey` smallint(6) NOT NULL DEFAULT 0,
  `isactive` tinyint(4) NOT NULL DEFAULT 1,
  `visibility_value_id` smallint(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bug_severity_value_idx` (`value`),
  KEY `bug_severity_sortkey_idx` (`sortkey`,`value`),
  KEY `bug_severity_visibility_value_id_idx` (`visibility_value_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bug_status`
--

DROP TABLE IF EXISTS `bug_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bug_status` (
  `id` smallint(6) NOT NULL AUTO_INCREMENT,
  `value` varchar(64) NOT NULL,
  `sortkey` smallint(6) NOT NULL DEFAULT 0,
  `isactive` tinyint(4) NOT NULL DEFAULT 1,
  `visibility_value_id` smallint(6) DEFAULT NULL,
  `is_open` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bug_status_value_idx` (`value`),
  KEY `bug_status_sortkey_idx` (`sortkey`,`value`),
  KEY `bug_status_visibility_value_id_idx` (`visibility_value_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bug_tag`
--

DROP TABLE IF EXISTS `bug_tag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bug_tag` (
  `bug_id` mediumint(9) NOT NULL,
  `tag_id` mediumint(9) NOT NULL,
  UNIQUE KEY `bug_tag_bug_id_idx` (`bug_id`,`tag_id`),
  KEY `fk_bug_tag_tag_id_tag_id` (`tag_id`),
  CONSTRAINT `fk_bug_tag_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bug_tag_tag_id_tag_id` FOREIGN KEY (`tag_id`) REFERENCES `tag` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bug_user_last_visit`
--

DROP TABLE IF EXISTS `bug_user_last_visit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bug_user_last_visit` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` mediumint(9) NOT NULL,
  `bug_id` mediumint(9) NOT NULL,
  `last_visit_ts` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bug_user_last_visit_idx` (`user_id`,`bug_id`),
  KEY `bug_user_last_visit_last_visit_ts_idx` (`last_visit_ts`),
  KEY `fk_bug_user_last_visit_bug_id_bugs_bug_id` (`bug_id`),
  CONSTRAINT `fk_bug_user_last_visit_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bug_user_last_visit_user_id_profiles_userid` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bugs`
--

DROP TABLE IF EXISTS `bugs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bugs` (
  `bug_id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `assigned_to` mediumint(9) NOT NULL,
  `bug_file_loc` mediumtext NOT NULL DEFAULT '',
  `bug_severity` varchar(64) NOT NULL,
  `bug_status` varchar(64) NOT NULL,
  `creation_ts` datetime DEFAULT NULL,
  `delta_ts` datetime NOT NULL,
  `short_desc` varchar(255) NOT NULL,
  `op_sys` varchar(64) NOT NULL,
  `priority` varchar(64) NOT NULL,
  `product_id` smallint(6) NOT NULL,
  `rep_platform` varchar(64) NOT NULL,
  `reporter` mediumint(9) NOT NULL,
  `version` varchar(64) NOT NULL,
  `component_id` mediumint(9) NOT NULL,
  `resolution` varchar(64) NOT NULL DEFAULT '',
  `target_milestone` varchar(64) NOT NULL DEFAULT '---',
  `qa_contact` mediumint(9) DEFAULT NULL,
  `status_whiteboard` mediumtext NOT NULL DEFAULT '',
  `lastdiffed` datetime DEFAULT NULL,
  `everconfirmed` tinyint(4) NOT NULL,
  `reporter_accessible` tinyint(4) NOT NULL DEFAULT 1,
  `cclist_accessible` tinyint(4) NOT NULL DEFAULT 1,
  `estimated_time` decimal(7,2) NOT NULL DEFAULT 0.00,
  `remaining_time` decimal(7,2) NOT NULL DEFAULT 0.00,
  `deadline` datetime DEFAULT NULL,
  `cf_mantis_ref` varchar(255) NOT NULL DEFAULT '',
  `cf_subcomponent` varchar(64) NOT NULL DEFAULT '---',
  PRIMARY KEY (`bug_id`),
  KEY `bugs_assigned_to_idx` (`assigned_to`),
  KEY `bugs_creation_ts_idx` (`creation_ts`),
  KEY `bugs_delta_ts_idx` (`delta_ts`),
  KEY `bugs_bug_severity_idx` (`bug_severity`),
  KEY `bugs_bug_status_idx` (`bug_status`),
  KEY `bugs_op_sys_idx` (`op_sys`),
  KEY `bugs_priority_idx` (`priority`),
  KEY `bugs_product_id_idx` (`product_id`),
  KEY `bugs_reporter_idx` (`reporter`),
  KEY `bugs_version_idx` (`version`),
  KEY `bugs_component_id_idx` (`component_id`),
  KEY `bugs_resolution_idx` (`resolution`),
  KEY `bugs_target_milestone_idx` (`target_milestone`),
  KEY `bugs_qa_contact_idx` (`qa_contact`),
  CONSTRAINT `fk_bugs_assigned_to_profiles_userid` FOREIGN KEY (`assigned_to`) REFERENCES `profiles` (`userid`) ON UPDATE CASCADE,
  CONSTRAINT `fk_bugs_component_id_components_id` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_bugs_product_id_products_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_bugs_qa_contact_profiles_userid` FOREIGN KEY (`qa_contact`) REFERENCES `profiles` (`userid`) ON UPDATE CASCADE,
  CONSTRAINT `fk_bugs_reporter_profiles_userid` FOREIGN KEY (`reporter`) REFERENCES `profiles` (`userid`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bugs_activity`
--

DROP TABLE IF EXISTS `bugs_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bugs_activity` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bug_id` mediumint(9) NOT NULL,
  `attach_id` mediumint(9) DEFAULT NULL,
  `who` mediumint(9) NOT NULL,
  `bug_when` datetime NOT NULL,
  `fieldid` mediumint(9) NOT NULL,
  `added` varchar(255) DEFAULT NULL,
  `removed` varchar(255) DEFAULT NULL,
  `comment_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `bugs_activity_bug_id_idx` (`bug_id`),
  KEY `bugs_activity_who_idx` (`who`),
  KEY `bugs_activity_bug_when_idx` (`bug_when`),
  KEY `bugs_activity_fieldid_idx` (`fieldid`),
  KEY `bugs_activity_added_idx` (`added`),
  KEY `bugs_activity_removed_idx` (`removed`),
  KEY `fk_bugs_activity_comment_id_longdescs_comment_id` (`comment_id`),
  KEY `fk_bugs_activity_attach_id_attachments_attach_id` (`attach_id`),
  CONSTRAINT `fk_bugs_activity_attach_id_attachments_attach_id` FOREIGN KEY (`attach_id`) REFERENCES `attachments` (`attach_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bugs_activity_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bugs_activity_comment_id_longdescs_comment_id` FOREIGN KEY (`comment_id`) REFERENCES `longdescs` (`comment_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_bugs_activity_fieldid_fielddefs_id` FOREIGN KEY (`fieldid`) REFERENCES `fielddefs` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_bugs_activity_who_profiles_userid` FOREIGN KEY (`who`) REFERENCES `profiles` (`userid`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bugs_aliases`
--

DROP TABLE IF EXISTS `bugs_aliases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bugs_aliases` (
  `alias` varchar(40) NOT NULL,
  `bug_id` mediumint(9) DEFAULT NULL,
  UNIQUE KEY `bugs_aliases_alias_idx` (`alias`),
  KEY `bugs_aliases_bug_id_idx` (`bug_id`),
  CONSTRAINT `fk_bugs_aliases_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bugs_fulltext`
--

DROP TABLE IF EXISTS `bugs_fulltext`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bugs_fulltext` (
  `bug_id` mediumint(9) NOT NULL,
  `short_desc` varchar(255) NOT NULL,
  `comments` mediumtext DEFAULT NULL,
  `comments_noprivate` mediumtext DEFAULT NULL,
  PRIMARY KEY (`bug_id`),
  FULLTEXT KEY `bugs_fulltext_short_desc_idx` (`short_desc`),
  FULLTEXT KEY `bugs_fulltext_comments_idx` (`comments`),
  FULLTEXT KEY `bugs_fulltext_comments_noprivate_idx` (`comments_noprivate`),
  CONSTRAINT `fk_bugs_fulltext_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `bz_schema`
--

DROP TABLE IF EXISTS `bz_schema`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bz_schema` (
  `schema_data` longblob NOT NULL,
  `version` decimal(3,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `category_group_map`
--

DROP TABLE IF EXISTS `category_group_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `category_group_map` (
  `category_id` smallint(6) NOT NULL,
  `group_id` mediumint(9) NOT NULL,
  UNIQUE KEY `category_group_map_category_id_idx` (`category_id`,`group_id`),
  KEY `fk_category_group_map_group_id_groups_id` (`group_id`),
  CONSTRAINT `fk_category_group_map_category_id_series_categories_id` FOREIGN KEY (`category_id`) REFERENCES `series_categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_category_group_map_group_id_groups_id` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cc`
--

DROP TABLE IF EXISTS `cc`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `cc` (
  `bug_id` mediumint(9) NOT NULL,
  `who` mediumint(9) NOT NULL,
  UNIQUE KEY `cc_bug_id_idx` (`bug_id`,`who`),
  KEY `cc_who_idx` (`who`),
  CONSTRAINT `fk_cc_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cc_who_profiles_userid` FOREIGN KEY (`who`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cf_subcomponent`
--

DROP TABLE IF EXISTS `cf_subcomponent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `cf_subcomponent` (
  `id` smallint(6) NOT NULL AUTO_INCREMENT,
  `value` varchar(64) NOT NULL,
  `sortkey` smallint(6) NOT NULL DEFAULT 0,
  `isactive` tinyint(4) NOT NULL DEFAULT 1,
  `visibility_value_id` smallint(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cf_subcomponent_value_idx` (`value`),
  KEY `cf_subcomponent_sortkey_idx` (`sortkey`,`value`),
  KEY `cf_subcomponent_visibility_value_id_idx` (`visibility_value_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `classifications`
--

DROP TABLE IF EXISTS `classifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `classifications` (
  `id` smallint(6) NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `description` mediumtext DEFAULT NULL,
  `sortkey` smallint(6) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `classifications_name_idx` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `component_cc`
--

DROP TABLE IF EXISTS `component_cc`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `component_cc` (
  `user_id` mediumint(9) NOT NULL,
  `component_id` mediumint(9) NOT NULL,
  UNIQUE KEY `component_cc_user_id_idx` (`component_id`,`user_id`),
  KEY `fk_component_cc_user_id_profiles_userid` (`user_id`),
  CONSTRAINT `fk_component_cc_component_id_components_id` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_component_cc_user_id_profiles_userid` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `components`
--

DROP TABLE IF EXISTS `components`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `components` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `product_id` smallint(6) NOT NULL,
  `initialowner` mediumint(9) NOT NULL,
  `initialqacontact` mediumint(9) DEFAULT NULL,
  `description` mediumtext NOT NULL,
  `isactive` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `components_product_id_idx` (`product_id`,`name`),
  KEY `components_name_idx` (`name`),
  KEY `fk_components_initialowner_profiles_userid` (`initialowner`),
  KEY `fk_components_initialqacontact_profiles_userid` (`initialqacontact`),
  CONSTRAINT `fk_components_initialowner_profiles_userid` FOREIGN KEY (`initialowner`) REFERENCES `profiles` (`userid`) ON UPDATE CASCADE,
  CONSTRAINT `fk_components_initialqacontact_profiles_userid` FOREIGN KEY (`initialqacontact`) REFERENCES `profiles` (`userid`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_components_product_id_products_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dependencies`
--

DROP TABLE IF EXISTS `dependencies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `dependencies` (
  `blocked` mediumint(9) NOT NULL,
  `dependson` mediumint(9) NOT NULL,
  UNIQUE KEY `dependencies_blocked_idx` (`blocked`,`dependson`),
  KEY `dependencies_dependson_idx` (`dependson`),
  CONSTRAINT `fk_dependencies_blocked_bugs_bug_id` FOREIGN KEY (`blocked`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_dependencies_dependson_bugs_bug_id` FOREIGN KEY (`dependson`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `duplicates`
--

DROP TABLE IF EXISTS `duplicates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `duplicates` (
  `dupe_of` mediumint(9) NOT NULL,
  `dupe` mediumint(9) NOT NULL,
  PRIMARY KEY (`dupe`),
  KEY `fk_duplicates_dupe_of_bugs_bug_id` (`dupe_of`),
  CONSTRAINT `fk_duplicates_dupe_bugs_bug_id` FOREIGN KEY (`dupe`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_duplicates_dupe_of_bugs_bug_id` FOREIGN KEY (`dupe_of`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `email_bug_ignore`
--

DROP TABLE IF EXISTS `email_bug_ignore`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_bug_ignore` (
  `user_id` mediumint(9) NOT NULL,
  `bug_id` mediumint(9) NOT NULL,
  UNIQUE KEY `email_bug_ignore_user_id_idx` (`user_id`,`bug_id`),
  KEY `fk_email_bug_ignore_bug_id_bugs_bug_id` (`bug_id`),
  CONSTRAINT `fk_email_bug_ignore_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_email_bug_ignore_user_id_profiles_userid` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `email_setting`
--

DROP TABLE IF EXISTS `email_setting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_setting` (
  `user_id` mediumint(9) NOT NULL,
  `relationship` tinyint(4) NOT NULL,
  `event` tinyint(4) NOT NULL,
  UNIQUE KEY `email_setting_user_id_idx` (`user_id`,`relationship`,`event`),
  CONSTRAINT `fk_email_setting_user_id_profiles_userid` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `field_visibility`
--

DROP TABLE IF EXISTS `field_visibility`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `field_visibility` (
  `field_id` mediumint(9) DEFAULT NULL,
  `value_id` smallint(6) NOT NULL,
  UNIQUE KEY `field_visibility_field_id_idx` (`field_id`,`value_id`),
  CONSTRAINT `fk_field_visibility_field_id_fielddefs_id` FOREIGN KEY (`field_id`) REFERENCES `fielddefs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `fielddefs`
--

DROP TABLE IF EXISTS `fielddefs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fielddefs` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `type` smallint(6) NOT NULL DEFAULT 0,
  `custom` tinyint(4) NOT NULL DEFAULT 0,
  `description` tinytext NOT NULL,
  `long_desc` varchar(255) NOT NULL DEFAULT '',
  `mailhead` tinyint(4) NOT NULL DEFAULT 0,
  `sortkey` smallint(6) NOT NULL,
  `obsolete` tinyint(4) NOT NULL DEFAULT 0,
  `enter_bug` tinyint(4) NOT NULL DEFAULT 0,
  `buglist` tinyint(4) NOT NULL DEFAULT 0,
  `visibility_field_id` mediumint(9) DEFAULT NULL,
  `value_field_id` mediumint(9) DEFAULT NULL,
  `reverse_desc` tinytext DEFAULT NULL,
  `is_mandatory` tinyint(4) NOT NULL DEFAULT 0,
  `is_numeric` tinyint(4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `fielddefs_name_idx` (`name`),
  KEY `fielddefs_sortkey_idx` (`sortkey`),
  KEY `fielddefs_value_field_id_idx` (`value_field_id`),
  KEY `fielddefs_is_mandatory_idx` (`is_mandatory`),
  KEY `fk_fielddefs_visibility_field_id_fielddefs_id` (`visibility_field_id`),
  CONSTRAINT `fk_fielddefs_value_field_id_fielddefs_id` FOREIGN KEY (`value_field_id`) REFERENCES `fielddefs` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_fielddefs_visibility_field_id_fielddefs_id` FOREIGN KEY (`visibility_field_id`) REFERENCES `fielddefs` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `flagexclusions`
--

DROP TABLE IF EXISTS `flagexclusions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flagexclusions` (
  `type_id` mediumint(9) NOT NULL,
  `product_id` smallint(6) DEFAULT NULL,
  `component_id` mediumint(9) DEFAULT NULL,
  UNIQUE KEY `flagexclusions_type_id_idx` (`type_id`,`product_id`,`component_id`),
  KEY `fk_flagexclusions_component_id_components_id` (`component_id`),
  KEY `fk_flagexclusions_product_id_products_id` (`product_id`),
  CONSTRAINT `fk_flagexclusions_component_id_components_id` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_flagexclusions_product_id_products_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_flagexclusions_type_id_flagtypes_id` FOREIGN KEY (`type_id`) REFERENCES `flagtypes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `flaginclusions`
--

DROP TABLE IF EXISTS `flaginclusions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flaginclusions` (
  `type_id` mediumint(9) NOT NULL,
  `product_id` smallint(6) DEFAULT NULL,
  `component_id` mediumint(9) DEFAULT NULL,
  UNIQUE KEY `flaginclusions_type_id_idx` (`type_id`,`product_id`,`component_id`),
  KEY `fk_flaginclusions_component_id_components_id` (`component_id`),
  KEY `fk_flaginclusions_product_id_products_id` (`product_id`),
  CONSTRAINT `fk_flaginclusions_component_id_components_id` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_flaginclusions_product_id_products_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_flaginclusions_type_id_flagtypes_id` FOREIGN KEY (`type_id`) REFERENCES `flagtypes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `flags`
--

DROP TABLE IF EXISTS `flags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flags` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `type_id` mediumint(9) NOT NULL,
  `status` char(1) NOT NULL,
  `bug_id` mediumint(9) NOT NULL,
  `attach_id` mediumint(9) DEFAULT NULL,
  `creation_date` datetime NOT NULL,
  `modification_date` datetime DEFAULT NULL,
  `setter_id` mediumint(9) NOT NULL,
  `requestee_id` mediumint(9) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `flags_bug_id_idx` (`bug_id`,`attach_id`),
  KEY `flags_setter_id_idx` (`setter_id`),
  KEY `flags_requestee_id_idx` (`requestee_id`),
  KEY `flags_type_id_idx` (`type_id`),
  KEY `fk_flags_attach_id_attachments_attach_id` (`attach_id`),
  CONSTRAINT `fk_flags_attach_id_attachments_attach_id` FOREIGN KEY (`attach_id`) REFERENCES `attachments` (`attach_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_flags_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_flags_requestee_id_profiles_userid` FOREIGN KEY (`requestee_id`) REFERENCES `profiles` (`userid`) ON UPDATE CASCADE,
  CONSTRAINT `fk_flags_setter_id_profiles_userid` FOREIGN KEY (`setter_id`) REFERENCES `profiles` (`userid`) ON UPDATE CASCADE,
  CONSTRAINT `fk_flags_type_id_flagtypes_id` FOREIGN KEY (`type_id`) REFERENCES `flagtypes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `flagtypes`
--

DROP TABLE IF EXISTS `flagtypes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flagtypes` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `description` mediumtext NOT NULL,
  `cc_list` varchar(200) DEFAULT NULL,
  `target_type` char(1) NOT NULL DEFAULT 'b',
  `is_active` tinyint(4) NOT NULL DEFAULT 1,
  `is_requestable` tinyint(4) NOT NULL DEFAULT 0,
  `is_requesteeble` tinyint(4) NOT NULL DEFAULT 0,
  `is_multiplicable` tinyint(4) NOT NULL DEFAULT 0,
  `sortkey` smallint(6) NOT NULL DEFAULT 0,
  `grant_group_id` mediumint(9) DEFAULT NULL,
  `request_group_id` mediumint(9) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_flagtypes_grant_group_id_groups_id` (`grant_group_id`),
  KEY `fk_flagtypes_request_group_id_groups_id` (`request_group_id`),
  CONSTRAINT `fk_flagtypes_grant_group_id_groups_id` FOREIGN KEY (`grant_group_id`) REFERENCES `groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_flagtypes_request_group_id_groups_id` FOREIGN KEY (`request_group_id`) REFERENCES `groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `group_control_map`
--

DROP TABLE IF EXISTS `group_control_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `group_control_map` (
  `group_id` mediumint(9) NOT NULL,
  `product_id` smallint(6) NOT NULL,
  `entry` tinyint(4) NOT NULL DEFAULT 0,
  `membercontrol` tinyint(4) NOT NULL DEFAULT 0,
  `othercontrol` tinyint(4) NOT NULL DEFAULT 0,
  `canedit` tinyint(4) NOT NULL DEFAULT 0,
  `editcomponents` tinyint(4) NOT NULL DEFAULT 0,
  `editbugs` tinyint(4) NOT NULL DEFAULT 0,
  `canconfirm` tinyint(4) NOT NULL DEFAULT 0,
  UNIQUE KEY `group_control_map_product_id_idx` (`product_id`,`group_id`),
  KEY `group_control_map_group_id_idx` (`group_id`),
  CONSTRAINT `fk_group_control_map_group_id_groups_id` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_group_control_map_product_id_products_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `group_group_map`
--

DROP TABLE IF EXISTS `group_group_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `group_group_map` (
  `member_id` mediumint(9) NOT NULL,
  `grantor_id` mediumint(9) NOT NULL,
  `grant_type` tinyint(4) NOT NULL DEFAULT 0,
  UNIQUE KEY `group_group_map_member_id_idx` (`member_id`,`grantor_id`,`grant_type`),
  KEY `fk_group_group_map_grantor_id_groups_id` (`grantor_id`),
  CONSTRAINT `fk_group_group_map_grantor_id_groups_id` FOREIGN KEY (`grantor_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_group_group_map_member_id_groups_id` FOREIGN KEY (`member_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `groups`
--

DROP TABLE IF EXISTS `groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `groups` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` mediumtext NOT NULL,
  `isbuggroup` tinyint(4) NOT NULL,
  `userregexp` tinytext NOT NULL DEFAULT '',
  `isactive` tinyint(4) NOT NULL DEFAULT 1,
  `icon_url` tinytext DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `groups_name_idx` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `keyworddefs`
--

DROP TABLE IF EXISTS `keyworddefs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `keyworddefs` (
  `id` smallint(6) NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `description` mediumtext NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `keyworddefs_name_idx` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `keywords`
--

DROP TABLE IF EXISTS `keywords`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `keywords` (
  `bug_id` mediumint(9) NOT NULL,
  `keywordid` smallint(6) NOT NULL,
  UNIQUE KEY `keywords_bug_id_idx` (`bug_id`,`keywordid`),
  KEY `keywords_keywordid_idx` (`keywordid`),
  CONSTRAINT `fk_keywords_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_keywords_keywordid_keyworddefs_id` FOREIGN KEY (`keywordid`) REFERENCES `keyworddefs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `login_failure`
--

DROP TABLE IF EXISTS `login_failure`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_failure` (
  `user_id` mediumint(9) NOT NULL,
  `login_time` datetime NOT NULL,
  `ip_addr` varchar(40) NOT NULL,
  KEY `login_failure_user_id_idx` (`user_id`),
  CONSTRAINT `fk_login_failure_user_id_profiles_userid` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `logincookies`
--

DROP TABLE IF EXISTS `logincookies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `logincookies` (
  `cookie` varchar(16) NOT NULL,
  `userid` mediumint(9) NOT NULL,
  `ipaddr` varchar(40) DEFAULT NULL,
  `lastused` datetime NOT NULL,
  PRIMARY KEY (`cookie`),
  KEY `logincookies_lastused_idx` (`lastused`),
  KEY `fk_logincookies_userid_profiles_userid` (`userid`),
  CONSTRAINT `fk_logincookies_userid_profiles_userid` FOREIGN KEY (`userid`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `longdescs`
--

DROP TABLE IF EXISTS `longdescs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `longdescs` (
  `comment_id` int(11) NOT NULL AUTO_INCREMENT,
  `bug_id` mediumint(9) NOT NULL,
  `who` mediumint(9) NOT NULL,
  `bug_when` datetime NOT NULL,
  `work_time` decimal(7,2) NOT NULL DEFAULT 0.00,
  `thetext` mediumtext NOT NULL,
  `isprivate` tinyint(4) NOT NULL DEFAULT 0,
  `already_wrapped` tinyint(4) NOT NULL DEFAULT 0,
  `type` smallint(6) NOT NULL DEFAULT 0,
  `extra_data` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`comment_id`),
  KEY `longdescs_bug_id_idx` (`bug_id`,`work_time`),
  KEY `longdescs_who_idx` (`who`,`bug_id`),
  KEY `longdescs_bug_when_idx` (`bug_when`),
  CONSTRAINT `fk_longdescs_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_longdescs_who_profiles_userid` FOREIGN KEY (`who`) REFERENCES `profiles` (`userid`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `longdescs_tags`
--

DROP TABLE IF EXISTS `longdescs_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `longdescs_tags` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `comment_id` int(11) DEFAULT NULL,
  `tag` varchar(24) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `longdescs_tags_idx` (`comment_id`,`tag`),
  CONSTRAINT `fk_longdescs_tags_comment_id_longdescs_comment_id` FOREIGN KEY (`comment_id`) REFERENCES `longdescs` (`comment_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `longdescs_tags_activity`
--

DROP TABLE IF EXISTS `longdescs_tags_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `longdescs_tags_activity` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `bug_id` mediumint(9) NOT NULL,
  `comment_id` int(11) DEFAULT NULL,
  `who` mediumint(9) NOT NULL,
  `bug_when` datetime NOT NULL,
  `added` varchar(24) DEFAULT NULL,
  `removed` varchar(24) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `longdescs_tags_activity_bug_id_idx` (`bug_id`),
  KEY `fk_longdescs_tags_activity_who_profiles_userid` (`who`),
  KEY `fk_longdescs_tags_activity_comment_id_longdescs_comment_id` (`comment_id`),
  CONSTRAINT `fk_longdescs_tags_activity_bug_id_bugs_bug_id` FOREIGN KEY (`bug_id`) REFERENCES `bugs` (`bug_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_longdescs_tags_activity_comment_id_longdescs_comment_id` FOREIGN KEY (`comment_id`) REFERENCES `longdescs` (`comment_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_longdescs_tags_activity_who_profiles_userid` FOREIGN KEY (`who`) REFERENCES `profiles` (`userid`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `longdescs_tags_weights`
--

DROP TABLE IF EXISTS `longdescs_tags_weights`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `longdescs_tags_weights` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `tag` varchar(24) NOT NULL,
  `weight` mediumint(9) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `longdescs_tags_weights_tag_idx` (`tag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mail_staging`
--

DROP TABLE IF EXISTS `mail_staging`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `mail_staging` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `message` longblob NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `milestones`
--

DROP TABLE IF EXISTS `milestones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `milestones` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `product_id` smallint(6) NOT NULL,
  `value` varchar(64) NOT NULL,
  `sortkey` smallint(6) NOT NULL DEFAULT 0,
  `isactive` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `milestones_product_id_idx` (`product_id`,`value`),
  CONSTRAINT `fk_milestones_product_id_products_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `namedqueries`
--

DROP TABLE IF EXISTS `namedqueries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `namedqueries` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `userid` mediumint(9) NOT NULL,
  `name` varchar(64) NOT NULL,
  `query` mediumtext NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `namedqueries_userid_idx` (`userid`,`name`),
  CONSTRAINT `fk_namedqueries_userid_profiles_userid` FOREIGN KEY (`userid`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `namedqueries_link_in_footer`
--

DROP TABLE IF EXISTS `namedqueries_link_in_footer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `namedqueries_link_in_footer` (
  `namedquery_id` mediumint(9) NOT NULL,
  `user_id` mediumint(9) NOT NULL,
  UNIQUE KEY `namedqueries_link_in_footer_id_idx` (`namedquery_id`,`user_id`),
  KEY `namedqueries_link_in_footer_userid_idx` (`user_id`),
  CONSTRAINT `fk_namedqueries_link_in_footer_namedquery_id_namedqueries_id` FOREIGN KEY (`namedquery_id`) REFERENCES `namedqueries` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_namedqueries_link_in_footer_user_id_profiles_userid` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `namedquery_group_map`
--

DROP TABLE IF EXISTS `namedquery_group_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `namedquery_group_map` (
  `namedquery_id` mediumint(9) NOT NULL,
  `group_id` mediumint(9) NOT NULL,
  UNIQUE KEY `namedquery_group_map_namedquery_id_idx` (`namedquery_id`),
  KEY `namedquery_group_map_group_id_idx` (`group_id`),
  CONSTRAINT `fk_namedquery_group_map_group_id_groups_id` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_namedquery_group_map_namedquery_id_namedqueries_id` FOREIGN KEY (`namedquery_id`) REFERENCES `namedqueries` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `op_sys`
--

DROP TABLE IF EXISTS `op_sys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `op_sys` (
  `id` smallint(6) NOT NULL AUTO_INCREMENT,
  `value` varchar(64) NOT NULL,
  `sortkey` smallint(6) NOT NULL DEFAULT 0,
  `isactive` tinyint(4) NOT NULL DEFAULT 1,
  `visibility_value_id` smallint(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `op_sys_value_idx` (`value`),
  KEY `op_sys_sortkey_idx` (`sortkey`,`value`),
  KEY `op_sys_visibility_value_id_idx` (`visibility_value_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `priority`
--

DROP TABLE IF EXISTS `priority`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `priority` (
  `id` smallint(6) NOT NULL AUTO_INCREMENT,
  `value` varchar(64) NOT NULL,
  `sortkey` smallint(6) NOT NULL DEFAULT 0,
  `isactive` tinyint(4) NOT NULL DEFAULT 1,
  `visibility_value_id` smallint(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `priority_value_idx` (`value`),
  KEY `priority_sortkey_idx` (`sortkey`,`value`),
  KEY `priority_visibility_value_id_idx` (`visibility_value_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` smallint(6) NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `classification_id` smallint(6) NOT NULL DEFAULT 1,
  `description` mediumtext NOT NULL,
  `isactive` tinyint(4) NOT NULL DEFAULT 1,
  `defaultmilestone` varchar(64) NOT NULL DEFAULT '---',
  `allows_unconfirmed` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `products_name_idx` (`name`),
  KEY `fk_products_classification_id_classifications_id` (`classification_id`),
  CONSTRAINT `fk_products_classification_id_classifications_id` FOREIGN KEY (`classification_id`) REFERENCES `classifications` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `profile_search`
--

DROP TABLE IF EXISTS `profile_search`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `profile_search` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` mediumint(9) NOT NULL,
  `bug_list` mediumtext NOT NULL,
  `list_order` mediumtext DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `profile_search_user_id_idx` (`user_id`),
  CONSTRAINT `fk_profile_search_user_id_profiles_userid` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `profile_setting`
--

DROP TABLE IF EXISTS `profile_setting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `profile_setting` (
  `user_id` mediumint(9) NOT NULL,
  `setting_name` varchar(32) NOT NULL,
  `setting_value` varchar(32) NOT NULL,
  UNIQUE KEY `profile_setting_value_unique_idx` (`user_id`,`setting_name`),
  KEY `fk_profile_setting_setting_name_setting_name` (`setting_name`),
  CONSTRAINT `fk_profile_setting_setting_name_setting_name` FOREIGN KEY (`setting_name`) REFERENCES `setting` (`name`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_profile_setting_user_id_profiles_userid` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `profiles`
--

DROP TABLE IF EXISTS `profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `profiles` (
  `userid` mediumint(9) NOT NULL AUTO_INCREMENT,
  `login_name` varchar(255) NOT NULL,
  `cryptpassword` varchar(128) DEFAULT NULL,
  `realname` varchar(255) NOT NULL DEFAULT '',
  `disabledtext` mediumtext NOT NULL DEFAULT '',
  `disable_mail` tinyint(4) NOT NULL DEFAULT 0,
  `mybugslink` tinyint(4) NOT NULL DEFAULT 1,
  `extern_id` varchar(64) DEFAULT NULL,
  `is_enabled` tinyint(4) NOT NULL DEFAULT 1,
  `last_seen_date` datetime DEFAULT NULL,
  PRIMARY KEY (`userid`),
  UNIQUE KEY `profiles_login_name_idx` (`login_name`),
  UNIQUE KEY `profiles_extern_id_idx` (`extern_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `profiles_activity`
--

DROP TABLE IF EXISTS `profiles_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `profiles_activity` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `userid` mediumint(9) NOT NULL,
  `who` mediumint(9) NOT NULL,
  `profiles_when` datetime NOT NULL,
  `fieldid` mediumint(9) NOT NULL,
  `oldvalue` tinytext DEFAULT NULL,
  `newvalue` tinytext DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `profiles_activity_userid_idx` (`userid`),
  KEY `profiles_activity_profiles_when_idx` (`profiles_when`),
  KEY `profiles_activity_fieldid_idx` (`fieldid`),
  KEY `fk_profiles_activity_who_profiles_userid` (`who`),
  CONSTRAINT `fk_profiles_activity_fieldid_fielddefs_id` FOREIGN KEY (`fieldid`) REFERENCES `fielddefs` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_profiles_activity_userid_profiles_userid` FOREIGN KEY (`userid`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_profiles_activity_who_profiles_userid` FOREIGN KEY (`who`) REFERENCES `profiles` (`userid`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `quips`
--

DROP TABLE IF EXISTS `quips`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `quips` (
  `quipid` mediumint(9) NOT NULL AUTO_INCREMENT,
  `userid` mediumint(9) DEFAULT NULL,
  `quip` varchar(512) NOT NULL,
  `approved` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`quipid`),
  KEY `fk_quips_userid_profiles_userid` (`userid`),
  CONSTRAINT `fk_quips_userid_profiles_userid` FOREIGN KEY (`userid`) REFERENCES `profiles` (`userid`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rep_platform`
--

DROP TABLE IF EXISTS `rep_platform`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `rep_platform` (
  `id` smallint(6) NOT NULL AUTO_INCREMENT,
  `value` varchar(64) NOT NULL,
  `sortkey` smallint(6) NOT NULL DEFAULT 0,
  `isactive` tinyint(4) NOT NULL DEFAULT 1,
  `visibility_value_id` smallint(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rep_platform_value_idx` (`value`),
  KEY `rep_platform_sortkey_idx` (`sortkey`,`value`),
  KEY `rep_platform_visibility_value_id_idx` (`visibility_value_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reports`
--

DROP TABLE IF EXISTS `reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `reports` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `user_id` mediumint(9) NOT NULL,
  `name` varchar(64) NOT NULL,
  `query` mediumtext NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reports_user_id_idx` (`user_id`,`name`),
  CONSTRAINT `fk_reports_user_id_profiles_userid` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `resolution`
--

DROP TABLE IF EXISTS `resolution`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `resolution` (
  `id` smallint(6) NOT NULL AUTO_INCREMENT,
  `value` varchar(64) NOT NULL,
  `sortkey` smallint(6) NOT NULL DEFAULT 0,
  `isactive` tinyint(4) NOT NULL DEFAULT 1,
  `visibility_value_id` smallint(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `resolution_value_idx` (`value`),
  KEY `resolution_sortkey_idx` (`sortkey`,`value`),
  KEY `resolution_visibility_value_id_idx` (`visibility_value_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `series`
--

DROP TABLE IF EXISTS `series`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `series` (
  `series_id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `creator` mediumint(9) DEFAULT NULL,
  `category` smallint(6) NOT NULL,
  `subcategory` smallint(6) NOT NULL,
  `name` varchar(64) NOT NULL,
  `frequency` smallint(6) NOT NULL,
  `query` mediumtext NOT NULL,
  `is_public` tinyint(4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`series_id`),
  UNIQUE KEY `series_category_idx` (`category`,`subcategory`,`name`),
  KEY `series_creator_idx` (`creator`),
  KEY `fk_series_subcategory_series_categories_id` (`subcategory`),
  CONSTRAINT `fk_series_category_series_categories_id` FOREIGN KEY (`category`) REFERENCES `series_categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_series_creator_profiles_userid` FOREIGN KEY (`creator`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_series_subcategory_series_categories_id` FOREIGN KEY (`subcategory`) REFERENCES `series_categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `series_categories`
--

DROP TABLE IF EXISTS `series_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `series_categories` (
  `id` smallint(6) NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `series_categories_name_idx` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `series_data`
--

DROP TABLE IF EXISTS `series_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `series_data` (
  `series_id` mediumint(9) NOT NULL,
  `series_date` datetime NOT NULL,
  `series_value` mediumint(9) NOT NULL,
  UNIQUE KEY `series_data_series_id_idx` (`series_id`,`series_date`),
  CONSTRAINT `fk_series_data_series_id_series_series_id` FOREIGN KEY (`series_id`) REFERENCES `series` (`series_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `setting`
--

DROP TABLE IF EXISTS `setting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `setting` (
  `name` varchar(32) NOT NULL,
  `default_value` varchar(32) NOT NULL,
  `is_enabled` tinyint(4) NOT NULL DEFAULT 1,
  `subclass` varchar(32) DEFAULT NULL,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `setting_value`
--

DROP TABLE IF EXISTS `setting_value`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `setting_value` (
  `name` varchar(32) NOT NULL,
  `value` varchar(32) NOT NULL,
  `sortindex` smallint(6) NOT NULL,
  UNIQUE KEY `setting_value_nv_unique_idx` (`name`,`value`),
  UNIQUE KEY `setting_value_ns_unique_idx` (`name`,`sortindex`),
  CONSTRAINT `fk_setting_value_name_setting_name` FOREIGN KEY (`name`) REFERENCES `setting` (`name`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `status_workflow`
--

DROP TABLE IF EXISTS `status_workflow`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `status_workflow` (
  `old_status` smallint(6) DEFAULT NULL,
  `new_status` smallint(6) NOT NULL,
  `require_comment` tinyint(4) NOT NULL DEFAULT 0,
  UNIQUE KEY `status_workflow_idx` (`old_status`,`new_status`),
  KEY `fk_status_workflow_new_status_bug_status_id` (`new_status`),
  CONSTRAINT `fk_status_workflow_new_status_bug_status_id` FOREIGN KEY (`new_status`) REFERENCES `bug_status` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_status_workflow_old_status_bug_status_id` FOREIGN KEY (`old_status`) REFERENCES `bug_status` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tag`
--

DROP TABLE IF EXISTS `tag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tag` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL,
  `user_id` mediumint(9) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tag_user_id_idx` (`user_id`,`name`),
  CONSTRAINT `fk_tag_user_id_profiles_userid` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tokens`
--

DROP TABLE IF EXISTS `tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tokens` (
  `userid` mediumint(9) DEFAULT NULL,
  `issuedate` datetime NOT NULL,
  `token` varchar(16) NOT NULL,
  `tokentype` varchar(16) NOT NULL,
  `eventdata` tinytext DEFAULT NULL,
  PRIMARY KEY (`token`),
  KEY `tokens_userid_idx` (`userid`),
  CONSTRAINT `fk_tokens_userid_profiles_userid` FOREIGN KEY (`userid`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ts_error`
--

DROP TABLE IF EXISTS `ts_error`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ts_error` (
  `error_time` int(11) NOT NULL,
  `jobid` int(11) NOT NULL,
  `message` varchar(255) NOT NULL,
  `funcid` int(11) NOT NULL DEFAULT 0,
  KEY `ts_error_funcid_idx` (`funcid`,`error_time`),
  KEY `ts_error_error_time_idx` (`error_time`),
  KEY `ts_error_jobid_idx` (`jobid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ts_exitstatus`
--

DROP TABLE IF EXISTS `ts_exitstatus`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ts_exitstatus` (
  `jobid` int(11) NOT NULL AUTO_INCREMENT,
  `funcid` int(11) NOT NULL DEFAULT 0,
  `status` smallint(6) DEFAULT NULL,
  `completion_time` int(11) DEFAULT NULL,
  `delete_after` int(11) DEFAULT NULL,
  PRIMARY KEY (`jobid`),
  KEY `ts_exitstatus_funcid_idx` (`funcid`),
  KEY `ts_exitstatus_delete_after_idx` (`delete_after`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ts_funcmap`
--

DROP TABLE IF EXISTS `ts_funcmap`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ts_funcmap` (
  `funcid` int(11) NOT NULL AUTO_INCREMENT,
  `funcname` varchar(255) NOT NULL,
  PRIMARY KEY (`funcid`),
  UNIQUE KEY `ts_funcmap_funcname_idx` (`funcname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ts_job`
--

DROP TABLE IF EXISTS `ts_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ts_job` (
  `jobid` int(11) NOT NULL AUTO_INCREMENT,
  `funcid` int(11) NOT NULL,
  `arg` longblob DEFAULT NULL,
  `uniqkey` varchar(255) DEFAULT NULL,
  `insert_time` int(11) DEFAULT NULL,
  `run_after` int(11) NOT NULL,
  `grabbed_until` int(11) NOT NULL,
  `priority` smallint(6) DEFAULT NULL,
  `coalesce` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`jobid`),
  UNIQUE KEY `ts_job_funcid_idx` (`funcid`,`uniqkey`),
  KEY `ts_job_run_after_idx` (`run_after`,`funcid`),
  KEY `ts_job_coalesce_idx` (`coalesce`,`funcid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `ts_note`
--

DROP TABLE IF EXISTS `ts_note`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ts_note` (
  `jobid` int(11) NOT NULL,
  `notekey` varchar(255) DEFAULT NULL,
  `value` longblob DEFAULT NULL,
  UNIQUE KEY `ts_note_jobid_idx` (`jobid`,`notekey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=DYNAMIC;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_api_keys`
--

DROP TABLE IF EXISTS `user_api_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_api_keys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` mediumint(9) NOT NULL,
  `api_key` varchar(40) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `revoked` tinyint(4) NOT NULL DEFAULT 0,
  `last_used` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_api_keys_api_key_idx` (`api_key`),
  KEY `user_api_keys_user_id_idx` (`user_id`),
  CONSTRAINT `fk_user_api_keys_user_id_profiles_userid` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_group_map`
--

DROP TABLE IF EXISTS `user_group_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_group_map` (
  `user_id` mediumint(9) NOT NULL,
  `group_id` mediumint(9) NOT NULL,
  `isbless` tinyint(4) NOT NULL DEFAULT 0,
  `grant_type` tinyint(4) NOT NULL DEFAULT 0,
  UNIQUE KEY `user_group_map_user_id_idx` (`user_id`,`group_id`,`grant_type`,`isbless`),
  KEY `fk_user_group_map_group_id_groups_id` (`group_id`),
  CONSTRAINT `fk_user_group_map_group_id_groups_id` FOREIGN KEY (`group_id`) REFERENCES `groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_group_map_user_id_profiles_userid` FOREIGN KEY (`user_id`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `versions`
--

DROP TABLE IF EXISTS `versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `versions` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `value` varchar(64) NOT NULL,
  `product_id` smallint(6) NOT NULL,
  `isactive` tinyint(4) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `versions_product_id_idx` (`product_id`,`value`),
  CONSTRAINT `fk_versions_product_id_products_id` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `watch`
--

DROP TABLE IF EXISTS `watch`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `watch` (
  `watcher` mediumint(9) NOT NULL,
  `watched` mediumint(9) NOT NULL,
  UNIQUE KEY `watch_watcher_idx` (`watcher`,`watched`),
  KEY `watch_watched_idx` (`watched`),
  CONSTRAINT `fk_watch_watched_profiles_userid` FOREIGN KEY (`watched`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_watch_watcher_profiles_userid` FOREIGN KEY (`watcher`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `whine_events`
--

DROP TABLE IF EXISTS `whine_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `whine_events` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `owner_userid` mediumint(9) NOT NULL,
  `subject` varchar(128) DEFAULT NULL,
  `body` mediumtext DEFAULT NULL,
  `mailifnobugs` tinyint(4) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fk_whine_events_owner_userid_profiles_userid` (`owner_userid`),
  CONSTRAINT `fk_whine_events_owner_userid_profiles_userid` FOREIGN KEY (`owner_userid`) REFERENCES `profiles` (`userid`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `whine_queries`
--

DROP TABLE IF EXISTS `whine_queries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `whine_queries` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `eventid` mediumint(9) NOT NULL,
  `query_name` varchar(64) NOT NULL DEFAULT '',
  `sortkey` smallint(6) NOT NULL DEFAULT 0,
  `onemailperbug` tinyint(4) NOT NULL DEFAULT 0,
  `title` varchar(128) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `whine_queries_eventid_idx` (`eventid`),
  CONSTRAINT `fk_whine_queries_eventid_whine_events_id` FOREIGN KEY (`eventid`) REFERENCES `whine_events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `whine_schedules`
--

DROP TABLE IF EXISTS `whine_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `whine_schedules` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `eventid` mediumint(9) NOT NULL,
  `run_day` varchar(32) DEFAULT NULL,
  `run_time` varchar(32) DEFAULT NULL,
  `run_next` datetime DEFAULT NULL,
  `mailto` mediumint(9) NOT NULL,
  `mailto_type` smallint(6) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `whine_schedules_run_next_idx` (`run_next`),
  KEY `whine_schedules_eventid_idx` (`eventid`),
  CONSTRAINT `fk_whine_schedules_eventid_whine_events_id` FOREIGN KEY (`eventid`) REFERENCES `whine_events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed
