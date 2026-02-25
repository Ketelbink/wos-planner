-- ==============================================================
-- WoS Planner – Migration 0002
-- Purpose: Core map + objects + occupancy
-- ==============================================================

CREATE TABLE IF NOT EXISTS maps (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(60) NOT NULL,
  name VARCHAR(120) NOT NULL,
  width SMALLINT UNSIGNED NOT NULL DEFAULT 1200,
  height SMALLINT UNSIGNED NOT NULL DEFAULT 1200,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_maps_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS planner_objects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  map_id INT UNSIGNED NOT NULL,
  type VARCHAR(30) NOT NULL,
  x INT NOT NULL,
  y INT NOT NULL,
  owner_alliance_id INT UNSIGNED NULL,
  owner_ingame_id BIGINT UNSIGNED NULL,
  owner_profile_id BIGINT UNSIGNED NULL,
  meta_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_map_anchor (map_id, x, y),
  CONSTRAINT fk_objects_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Single-tile occupancy enforcement (works with footprints)
CREATE TABLE IF NOT EXISTS planner_occupancy (
  map_id INT UNSIGNED NOT NULL,
  x INT NOT NULL,
  y INT NOT NULL,
  object_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (map_id, x, y),
  KEY idx_object (object_id),
  CONSTRAINT fk_occ_map FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
  CONSTRAINT fk_occ_object FOREIGN KEY (object_id) REFERENCES planner_objects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;