-- 0004_object_types.sql
-- WoS Planner migration: object types catalogue for palette + footprints
-- Safe: new migration file; does not overwrite existing migrations.

CREATE TABLE IF NOT EXISTS planner_object_types (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  default_layer VARCHAR(16) NOT NULL DEFAULT 'object',
  default_locked TINYINT(1) NOT NULL DEFAULT 0,
  default_meta_json JSON NULL,
  footprint_json JSON NULL,
  sort_order INT NOT NULL DEFAULT 100,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_code (code),
  KEY idx_enabled_sort (is_enabled, sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO planner_object_types
(code, name, default_layer, default_locked, default_meta_json, footprint_json, sort_order) VALUES
('player_object','Player Object','object',0,JSON_OBJECT('tag','','note','','color',''),JSON_ARRAY(JSON_OBJECT('dx',0,'dy',0)),999),
('castle','Castle','system',1,JSON_OBJECT('tag','Castle','note','System: Castle','color','rgba(90,242,196,.40)'),JSON_ARRAY(JSON_OBJECT('dx',0,'dy',0)),10),
('tower','Tower','system',1,JSON_OBJECT('tag','Tower','note','System: Tower','color','rgba(90,242,196,.30)'),JSON_ARRAY(JSON_OBJECT('dx',0,'dy',0)),20),
('facility','Facility','system',1,JSON_OBJECT('tag','Facility','note','System: Facility','color','rgba(90,242,196,.25)'),JSON_ARRAY(JSON_OBJECT('dx',0,'dy',0)),30),
('obstacle','Obstacle','system',1,JSON_OBJECT('tag','Obstacle','note','System: Obstacle','color','rgba(90,242,196,.18)'),JSON_ARRAY(JSON_OBJECT('dx',0,'dy',0)),40);
