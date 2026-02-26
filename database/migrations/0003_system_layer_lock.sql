-- 0003_system_layer_lock.sql
-- WoS Planner migration: add system layer + lock flag
-- Safe: new migration file; does not overwrite existing migrations.

ALTER TABLE planner_objects
  ADD COLUMN layer VARCHAR(16) NOT NULL DEFAULT 'object' AFTER type,
  ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0 AFTER layer;

CREATE INDEX idx_planner_objects_map_layer ON planner_objects (map_id, layer);
