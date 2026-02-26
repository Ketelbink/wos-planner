<?php
// app/Controllers/PlannerApi.php
// WoS Planner – API endpoints for V1.0 step 1 (system layer + lock + select/edit/move/delete)
// Notes:
// - This file is framework-agnostic. Wire it into your routing & request/response helpers.
// - Assumes tables: planner_maps (id, slug, ...), planner_objects (id, map_id, type, layer, is_locked, x, y, meta_json, ...)
// - Assumes table: planner_occupancy (map_id, x, y, object_id) with FK to planner_objects(id) ON DELETE CASCADE.
//
// If your project already has a controller for planner API, copy/paste the methods below.

class PlannerApi
{
    private $db;

    public function __construct($dbConnection)
    {
        $this->db = $dbConnection;
    }

    // ----------------------------
    // Helpers
    // ----------------------------

    private function json($data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    private function getJsonBody(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    private function getMapBySlug(string $slug): array
    {
        $stmt = $this->db->prepare("SELECT * FROM planner_maps WHERE slug = ? LIMIT 1");
        $stmt->execute([$slug]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) $this->json(['error' => 'map_not_found'], 404);
        return $row;
    }

    private function normalizeLayer(?string $layer): string
    {
        $layer = strtolower(trim((string)$layer));
        if ($layer === 'system' || $layer === 'object') return $layer;
        return 'all';
    }

    private function getObjectById(int $id): array
    {
        $stmt = $this->db->prepare("SELECT * FROM planner_objects WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$row) $this->json(['error' => 'object_not_found'], 404);
        return $row;
    }

    private function getFootprintTiles(array $objectOrMeta, int $anchorX, int $anchorY): array
    {
        // Footprint contract:
        // - If meta_json contains {"footprint":[{"dx":0,"dy":0}, ...]} we use that.
        // - Else: single tile footprint.
        $meta = $objectOrMeta;
        if (isset($objectOrMeta['meta_json'])) {
            $meta = json_decode($objectOrMeta['meta_json'] ?? '{}', true) ?: [];
        }

        $tiles = [];
        if (isset($meta['footprint']) && is_array($meta['footprint']) && count($meta['footprint']) > 0) {
            foreach ($meta['footprint'] as $t) {
                $dx = (int)($t['dx'] ?? 0);
                $dy = (int)($t['dy'] ?? 0);
                $tiles[] = ['x' => $anchorX + $dx, 'y' => $anchorY + $dy];
            }
        } else {
            $tiles[] = ['x' => $anchorX, 'y' => $anchorY];
        }
        return $tiles;
    }

    private function occupancyFree(int $mapId, array $tiles, int $ignoreObjectId = 0): bool
    {
        // Checks if every tile is free (or occupied by ignoreObjectId).
        $sql = "SELECT COUNT(*) AS cnt
                FROM planner_occupancy
                WHERE map_id = ?
                  AND (x, y) IN (%s)
                  AND object_id <> ?";
        $pairs = [];
        $params = [$mapId];
        foreach ($tiles as $t) {
            $pairs[] = "(?, ?)";
            $params[] = (int)$t['x'];
            $params[] = (int)$t['y'];
        }
        $params[] = $ignoreObjectId;

        $stmt = $this->db->prepare(sprintf($sql, implode(',', $pairs)));
        $stmt->execute($params);
        $cnt = (int)($stmt->fetch(\PDO::FETCH_ASSOC)['cnt'] ?? 0);
        return $cnt === 0;
    }

    private function occupancyRelease(int $mapId, int $objectId): void
    {
        $stmt = $this->db->prepare("DELETE FROM planner_occupancy WHERE map_id = ? AND object_id = ?");
        $stmt->execute([$mapId, $objectId]);
    }

    private function occupancyClaim(int $mapId, int $objectId, array $tiles): void
    {
        $stmt = $this->db->prepare("INSERT INTO planner_occupancy (map_id, x, y, object_id) VALUES (?, ?, ?, ?)");
        foreach ($tiles as $t) {
            $stmt->execute([$mapId, (int)$t['x'], (int)$t['y'], $objectId]);
        }
    }

    // ----------------------------
    // Endpoints
    // ----------------------------

    // GET /api/maps/{slug}/objects?layer=system|object|all
    public function mapObjects(string $slug): void
    {
        $map = $this->getMapBySlug($slug);
        $layer = $this->normalizeLayer($_GET['layer'] ?? 'all');

        if ($layer === 'all') {
            $stmt = $this->db->prepare("SELECT * FROM planner_objects WHERE map_id = ? ORDER BY layer, id");
            $stmt->execute([(int)$map['id']]);
        } else {
            $stmt = $this->db->prepare("SELECT * FROM planner_objects WHERE map_id = ? AND layer = ? ORDER BY id");
            $stmt->execute([(int)$map['id'], $layer]);
        }

        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $this->json(['map' => ['id' => (int)$map['id'], 'slug' => $map['slug']], 'layer' => $layer, 'objects' => $rows]);
    }

    // GET /api/maps/{slug}/tile?x=..&y=..&layer=system|object|all
    public function objectByTile(string $slug): void
    {
        $map = $this->getMapBySlug($slug);
        $x = isset($_GET['x']) ? (int)$_GET['x'] : null;
        $y = isset($_GET['y']) ? (int)$_GET['y'] : null;
        if ($x === null || $y === null) $this->json(['error' => 'missing_x_y'], 400);

        $layer = $this->normalizeLayer($_GET['layer'] ?? 'all');

        // We use occupancy as source of truth.
        if ($layer === 'all') {
            $sql = "SELECT o.*
                    FROM planner_occupancy occ
                    JOIN planner_objects o ON o.id = occ.object_id
                    WHERE occ.map_id = ? AND occ.x = ? AND occ.y = ?
                    ORDER BY FIELD(o.layer,'system','object'), o.id
                    LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([(int)$map['id'], $x, $y]);
        } else {
            $sql = "SELECT o.*
                    FROM planner_occupancy occ
                    JOIN planner_objects o ON o.id = occ.object_id
                    WHERE occ.map_id = ? AND occ.x = ? AND occ.y = ? AND o.layer = ?
                    ORDER BY o.id
                    LIMIT 1";
            $stmt = $this->db->prepare($sql);
            $stmt->execute([(int)$map['id'], $x, $y, $layer]);
        }

        $obj = $stmt->fetch(\PDO::FETCH_ASSOC);
        $this->json(['map' => ['id' => (int)$map['id'], 'slug' => $map['slug']], 'x' => $x, 'y' => $y, 'layer' => $layer, 'object' => $obj ?: null]);
    }

    // POST /api/objects/{id}/update
    // Body: { "tag": "...", "note": "...", "color": "#AABBCC" }
    public function objectUpdate(int $id): void
    {
        $obj = $this->getObjectById($id);
        if ((int)$obj['is_locked'] === 1) {
            $this->json(['error' => 'locked_object'], 403);
        }

        $body = $this->getJsonBody();
        $meta = json_decode($obj['meta_json'] ?? '{}', true) ?: [];

        // Keep meta stable; only allow these keys for now.
        foreach (['tag','note','color'] as $k) {
            if (array_key_exists($k, $body)) {
                $meta[$k] = $body[$k];
            }
        }

        $stmt = $this->db->prepare("UPDATE planner_objects SET meta_json = ? WHERE id = ?");
        $stmt->execute([json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $id]);

        $this->json(['ok' => true, 'id' => $id, 'meta' => $meta]);
    }

    // POST /api/objects/{id}/move
    // Body: { "x": 12, "y": 34 }
    public function objectMove(int $id): void
    {
        $obj = $this->getObjectById($id);
        if ((int)$obj['is_locked'] === 1) {
            $this->json(['error' => 'locked_object'], 403);
        }

        $body = $this->getJsonBody();
        if (!isset($body['x']) || !isset($body['y'])) $this->json(['error' => 'missing_x_y'], 400);

        $newX = (int)$body['x'];
        $newY = (int)$body['y'];

        $mapId = (int)$obj['map_id'];

        $this->db->beginTransaction();
        try {
            // Release current occupancy
            $this->occupancyRelease($mapId, $id);

            // Check new occupancy based on footprint
            $tiles = $this->getFootprintTiles($obj, $newX, $newY);

            if (!$this->occupancyFree($mapId, $tiles, 0)) {
                // Re-claim old tiles before aborting
                $oldTiles = $this->getFootprintTiles($obj, (int)$obj['x'], (int)$obj['y']);
                $this->occupancyClaim($mapId, $id, $oldTiles);
                $this->db->rollBack();
                $this->json(['error' => 'target_occupied', 'tiles' => $tiles], 409);
            }

            // Move anchor
            $stmt = $this->db->prepare("UPDATE planner_objects SET x = ?, y = ? WHERE id = ?");
            $stmt->execute([$newX, $newY, $id]);

            // Claim new occupancy
            $this->occupancyClaim($mapId, $id, $tiles);

            $this->db->commit();
            $this->json(['ok' => true, 'id' => $id, 'x' => $newX, 'y' => $newY, 'tiles' => $tiles]);
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            $this->json(['error' => 'move_failed', 'message' => $e->getMessage()], 500);
        }
    }

    // DELETE /api/objects/{id}
    public function objectDelete(int $id): void
    {
        $obj = $this->getObjectById($id);
        if ((int)$obj['is_locked'] === 1) {
            $this->json(['error' => 'locked_object'], 403);
        }

        $this->db->beginTransaction();
        try {
            // Occupancy is expected to cascade, but we delete explicitly too (safe + clear).
            $this->occupancyRelease((int)$obj['map_id'], $id);

            $stmt = $this->db->prepare("DELETE FROM planner_objects WHERE id = ?");
            $stmt->execute([$id]);

            $this->db->commit();
            $this->json(['ok' => true, 'id' => $id]);
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            $this->json(['error' => 'delete_failed', 'message' => $e->getMessage()], 500);
        }
    }
}
