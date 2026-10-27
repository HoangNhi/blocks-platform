-- Source: blocks_catalog_dev. Target: catalog.
-- User explicitly authorized retaining only faculty and proceeding without
-- backup verification on 2026-10-22. This destroys all data in four tables.
-- Preflight: five base tables; no visible FK, routine, trigger, or event.
-- faculty baseline: 10 rows; CHECKSUM TABLE EXTENDED = 2754119180.
-- No DROP DATABASE, faculty changes, or disabled foreign-key checks.

DROP TABLE `catalog`.`Council`,
           `catalog`.`Cycle`,
           `catalog`.`EvaluationSchedule`,
           `catalog`.`Stakeholder`;

-- Expected: only faculty; unchanged schema, 10 rows, same checksum.
SELECT TABLE_NAME, TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'catalog'
ORDER BY TABLE_NAME;
SHOW CREATE TABLE `catalog`.`faculty`;
SELECT COUNT(*) AS faculty_rows FROM `catalog`.`faculty`;
CHECKSUM TABLE `catalog`.`faculty` EXTENDED;
