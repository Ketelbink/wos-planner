<?php
/**
 * ==============================================================
 * WoS Planner  V0.1
 * File: app/routes.php
 * Purpose: Route definitions (Single Source of Truth)
 * ==============================================================
 */
declare(strict_types=1);

/** @var \Planner\Router $router */

$router->get('/', function(array $params, array $ctx) {
    return "WoS Planner V0.1 OK";
});

$router->get('/health', function(array $params, array $ctx) {
    return [
        'ok'   => true,
        'env'  => $ctx['config']['app']['env'] ?? 'unknown',
        'name' => $ctx['config']['app']['name'] ?? 'unknown',
    ];
});

$router->get('/db/ping', function(array $params, array $ctx) {
    $pdo = $ctx['db']->pdo();
    $row = $pdo->query('SELECT 1 AS ok')->fetch();
    return ['db' => 'ok', 'result' => $row];
});

// ----------------------------------------------------------
// MAP PAGE
// ----------------------------------------------------------
$router->get('/map/{slug}', function(array $params, array $ctx) {
    $slug = $params['slug'] ?? '';
    $pdo  = $ctx['db']->pdo();

    $stmt = $pdo->prepare("SELECT id, slug, name, width, height FROM maps WHERE slug = :s LIMIT 1");
    $stmt->execute(['s' => $slug]);
    $map = $stmt->fetch();

    if (!$map) {
        \Planner\Response::json(['error' => 'Map not found'], 404);
        return null;
    }

    $basePath = $ctx['base_path'] ?? '';

    header('Content-Type: text/html; charset=utf-8');

    echo '<!doctype html><html><head><meta charset="utf-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<title>WoS Planner - ' . htmlspecialchars($map['name']) . '</title>';
    echo '<link rel="stylesheet" href="' . htmlspecialchars($basePath) . '/assets/map.css">';
    echo '</head><body>';

    echo '<div class="topbar">';
    echo '<strong>' . htmlspecialchars($map['name']) . '</strong>';
    echo '<div class="actions">';
    echo '<button class="chip" id="btnExport">Export</button>';
    echo '<button class="chip" id="btnImport">Import</button>';
    echo '<button class="chip" id="btnSeedSystem">Seed System</button>';
    echo '<label class="toggle"><input id="toggleSystem" type="checkbox" checked> System</label>';
    echo '<label class="toggle"><input id="toggleLabels" type="checkbox" checked> Labels</label>';
    echo '<label class="toggle"><input id="toggleFootprints" type="checkbox"> Footprints</label>';
    echo '<span id="status" class="muted">loading...</span>';
    echo '</div>';
    echo '</div>';

    echo '<div class="shell">';
      echo '<div class="panel">';
        echo '<div class="head">Tools</div>';
        echo '<div class="body">';
          echo '<button class="btn" id="toolSelect">Select</button>';
          echo '<div class="muted">Palette</div>';
          echo '<input id="typeSearch" class="search" type="text" placeholder="Search type…">';
          echo '<div id="typePalette" class="palette"></div>';
          echo '<div class="hint">Place: hover footprint • <b>R</b> rotate • click place</div>';
          echo '<button class="btn" id="toolPlace">Place</button>';
        echo '</div>';
      echo '</div>';

      echo '<div class="center"><canvas id="mapCanvas"></canvas></div>';

      echo '<div class="panel">';
        echo '<div class="head">Properties</div>';
        echo '<div class="body">';
          echo '<div class="muted">Selected</div>';
          echo '<div><b>ID:</b> <span id="propId">-</span></div>';
          echo '<div><b>Type:</b> <span id="propType">-</span></div>';
          echo '<div><b>Pos:</b> <span id="propPos">-</span></div>';
          echo '<div><b>Layer:</b> <span id="propLayer">-</span></div>';
          echo '<div><b>Locked:</b> <span id="propLocked">-</span></div>';

          echo '<label class="field"><span class="muted">Tag</span><input id="inpTag" placeholder="REN"></label>';
          echo '<label class="field"><span class="muted">Note</span><textarea id="inpNote" placeholder="note..."></textarea></label>';
          echo '<label class="field"><span class="muted">Color (hex)</span><input id="inpColor" value="#7aa2ff"></label>';

          echo '<div class="row">';
            echo '<button class="btn primary" id="btnSave">Save</button>';
            echo '<button class="btn" id="btnMove">Move</button>';
          echo '</div>';
          echo '<button class="btn" id="btnDelete">Delete</button>';
        echo '</div>';
      echo '</div>';
    echo '</div>';

    // Import modal
    echo '<div class="modal hidden" id="modalImport">';
      echo '<div class="modal-card">';
        echo '<div class="modal-head">';
          echo '<div class="modal-title">Import JSON</div>';
          echo '<button class="chip" id="btnCloseImport">Close</button>';
        echo '</div>';
        echo '<div class="modal-body">';
          echo '<div class="muted">Paste export JSON (schema <b>wos-planner-export-v1</b>). First do a dry-run.</div>';
          echo '<textarea id="importText" rows="12" placeholder=\'{"objects":[...]}\'>';
          echo '</textarea>';
          echo '<div class="row">';
            echo '<button class="btn primary" id="btnDryRun">Dry-run</button>';
            echo '<button class="btn" id="btnApply" disabled>Apply</button>';
          echo '</div>';
          echo '<pre class="report" id="importReport"></pre>';
        echo '</div>';
      echo '</div>';
    echo '</div>';

    echo '<script>';
    echo 'window.MAP_CFG = ' . json_encode([
        'slug' => $map['slug'],
        'width' => (int)$map['width'],
        'height' => (int)$map['height'],
        'basePath' => $basePath,
    ], JSON_UNESCAPED_SLASHES) . ';';
    echo '</script>';

    echo '<script src="' . htmlspecialchars($basePath) . '/assets/map.js?v=' . time() . '"></script>';
    echo '</body></html>';

    return null;
});


// ----------------------------------------------------------
// API: GET OBJECTS IN BBOX
// ----------------------------------------------------------
$router->get('/api/maps/{slug}/objects', function(array $params, array $ctx) {
    $slug = $params['slug'] ?? '';
    $pdo  = $ctx['db']->pdo();

    $stmt = $pdo->prepare("SELECT id, width, height FROM maps WHERE slug = :s LIMIT 1");
    $stmt->execute(['s' => $slug]);
    $map = $stmt->fetch();

    if (!$map) {
        \Planner\Response::json(['error' => 'Map not found'], 404);
        return null;
    }

    $xmin = (int)($_GET['xmin'] ?? 0);
    $xmax = (int)($_GET['xmax'] ?? 0);
    $ymin = (int)($_GET['ymin'] ?? 0);
    $ymax = (int)($_GET['ymax'] ?? 0);

    $layer = strtolower((string)($_GET['layer'] ?? 'all'));
    if (!in_array($layer, ['all','system','object'], true)) $layer = 'all';


    // clamp
    $xmin = max(0, min($xmin, (int)$map['width'] - 1));
    $xmax = max(0, min($xmax, (int)$map['width'] - 1));
    $ymin = max(0, min($ymin, (int)$map['height'] - 1));
    $ymax = max(0, min($ymax, (int)$map['height'] - 1));

    if ($xmax < $xmin) [$xmin, $xmax] = [$xmax, $xmin];
    if ($ymax < $ymin) [$ymin, $ymax] = [$ymax, $ymin];

    $q = $pdo->prepare("
        SELECT id, type, layer, is_locked, x, y, meta_json
        FROM planner_objects
        WHERE map_id = :map_id
          AND x BETWEEN :xmin AND :xmax
          AND y BETWEEN :ymin AND :ymax
        ORDER BY id DESC
        LIMIT 5000
    ");
    $q->execute([
        'map_id' => (int)$map['id'],
        'xmin' => $xmin, 'xmax' => $xmax,
        'ymin' => $ymin, 'ymax' => $ymax,
    ]);

    return ['objects' => $q->fetchAll()];
});


// ----------------------------------------------------------
// API: PLACE OBJECT (with footprint occupancy enforcement)
// ----------------------------------------------------------
$router->post('/api/maps/{slug}/place', function(array $params, array $ctx) {
    $slug = $params['slug'] ?? '';
    $pdo  = $ctx['db']->pdo();

    $stmt = $pdo->prepare("SELECT id, width, height FROM maps WHERE slug = :s LIMIT 1");
    $stmt->execute(['s' => $slug]);
    $map = $stmt->fetch();

    if (!$map) {
        \Planner\Response::json(['error' => 'Map not found'], 404);
        return null;
    }

    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true) ?: [];

    $type = strtoupper(trim((string)($data['type'] ?? '')));
    $x = (int)($data['x'] ?? -1);
    $y = (int)($data['y'] ?? -1);
    $meta = $data['meta'] ?? [];

    $allowed = ['BANNER','CITY','TRAP','HQ'];
    if (!in_array($type, $allowed, true)) {
        \Planner\Response::json(['error' => 'Invalid type'], 400);
        return null;
    }

    $W = (int)$map['width'];
    $H = (int)$map['height'];

    if ($x < 0 || $y < 0 || $x >= $W || $y >= $H) {
        \Planner\Response::json(['error' => 'Out of bounds'], 400);
        return null;
    }

    // Footprints: anchor bottom-left
    $fp = ['w' => 1, 'h' => 1];
    if ($type === 'CITY') $fp = ['w' => 2, 'h' => 2];

    // bounds for footprint
    if ($x + $fp['w'] - 1 >= $W || $y + $fp['h'] - 1 >= $H) {
        \Planner\Response::json(['error' => 'Footprint out of bounds'], 400);
        return null;
    }

    $mapId = (int)$map['id'];

    try {
        $pdo->beginTransaction();

        // 1) check occupancy for all footprint tiles
        $check = $pdo->prepare("SELECT x, y, object_id FROM planner_occupancy WHERE map_id = :m AND x = :x AND y = :y LIMIT 1");

        for ($dx = 0; $dx < $fp['w']; $dx++) {
            for ($dy = 0; $dy < $fp['h']; $dy++) {
                $tx = $x + $dx;
                $ty = $y + $dy;

                $check->execute(['m' => $mapId, 'x' => $tx, 'y' => $ty]);
                $hit = $check->fetch();
                if ($hit) {
                    $pdo->rollBack();
                    \Planner\Response::json([
                        'error' => 'Tile occupied',
                        'tile' => ['x' => (int)$hit['x'], 'y' => (int)$hit['y']],
                        'by_object_id' => (int)$hit['object_id'],
                    ], 409);
                    return null;
                }
            }
        }

        // 2) insert object
        $ins = $pdo->prepare("
            INSERT INTO planner_objects (map_id, type, x, y, meta_json)
            VALUES (:map_id, :type, :x, :y, :meta_json)
        ");
        $ins->execute([
            'map_id' => $mapId,
            'type' => $type,
            'x' => $x,
            'y' => $y,
            'meta_json' => json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);

        $objectId = (int)$pdo->lastInsertId();

        // 3) claim occupancy tiles
        $occ = $pdo->prepare("
            INSERT INTO planner_occupancy (map_id, x, y, object_id)
            VALUES (:m, :x, :y, :oid)
        ");

        for ($dx = 0; $dx < $fp['w']; $dx++) {
            for ($dy = 0; $dy < $fp['h']; $dy++) {
                $occ->execute([
                    'm' => $mapId,
                    'x' => $x + $dx,
                    'y' => $y + $dy,
                    'oid' => $objectId,
                ]);
            }
        }

        $pdo->commit();

        return ['ok' => true, 'id' => $objectId];

    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        \Planner\Response::json(['error' => 'Server error', 'detail' => $e->getMessage()], 500);
        return null;
    }
});

// ----------------------------------------------------------
// API: TILE LOOKUP (occupancy join)
// ----------------------------------------------------------
$router->get('/api/maps/{slug}/tile', function(array $params, array $ctx) {
    $slug = $params['slug'] ?? '';
    $pdo  = $ctx['db']->pdo();

    $stmt = $pdo->prepare("SELECT id FROM maps WHERE slug = :s LIMIT 1");
    $stmt->execute(['s' => $slug]);
    $map = $stmt->fetch();

    if (!$map) {
        \Planner\Response::json(['error' => 'Map not found'], 404);
        return null;
    }

    $x = isset($_GET['x']) ? (int)$_GET['x'] : null;
    $y = isset($_GET['y']) ? (int)$_GET['y'] : null;
    if ($x === null || $y === null) {
        \Planner\Response::json(['error' => 'missing_x_y'], 400);
        return null;
    }

    $layer = strtolower((string)($_GET['layer'] ?? 'all'));
    if (!in_array($layer, ['all','system','object'], true)) $layer = 'all';

    $mapId = (int)$map['id'];

    if ($layer === 'all') {
        $q = $pdo->prepare("
            SELECT o.*
            FROM planner_occupancy occ
            JOIN planner_objects o ON o.id = occ.object_id
            WHERE occ.map_id = :m AND occ.x = :x AND occ.y = :y
            ORDER BY FIELD(o.layer,'system','object'), o.id
            LIMIT 1
        ");
        $q->execute(['m'=>$mapId,'x'=>$x,'y'=>$y]);
    } else {
        $q = $pdo->prepare("
            SELECT o.*
            FROM planner_occupancy occ
            JOIN planner_objects o ON o.id = occ.object_id
            WHERE occ.map_id = :m AND occ.x = :x AND occ.y = :y AND o.layer = :layer
            LIMIT 1
        ");
        $q->execute(['m'=>$mapId,'x'=>$x,'y'=>$y,'layer'=>$layer]);
    }

    $obj = $q->fetch();
    return ['object' => $obj ?: null];
});


// ----------------------------------------------------------
// API: OBJECT TYPES (palette)
// ----------------------------------------------------------
$router->get('/api/object-types', function(array $params, array $ctx) {
    $pdo = $ctx['db']->pdo();
    $q = $pdo->query("
        SELECT id, code, name, default_layer, default_locked, default_meta_json, footprint_json, sort_order
        FROM planner_object_types
        WHERE is_enabled = 1
        ORDER BY sort_order, id
    ");
    return ['object_types' => $q->fetchAll()];
});


// ----------------------------------------------------------
// API: CREATE OBJECT (type catalogue + occupancy + optional footprint override)
// ----------------------------------------------------------
$router->post('/api/maps/{slug}/objects/create', function(array $params, array $ctx) {
    $slug = $params['slug'] ?? '';
    $pdo  = $ctx['db']->pdo();

    $stmt = $pdo->prepare("SELECT id, width, height FROM maps WHERE slug = :s LIMIT 1");
    $stmt->execute(['s' => $slug]);
    $map = $stmt->fetch();

    if (!$map) {
        \Planner\Response::json(['error' => 'Map not found'], 404);
        return null;
    }

    $data = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
    $typeCode = (string)($data['type_code'] ?? 'player_object');
    $x = (int)($data['x'] ?? -1);
    $y = (int)($data['y'] ?? -1);
    $incomingMeta = is_array($data['meta'] ?? null) ? $data['meta'] : [];

    $tQ = $pdo->prepare("SELECT * FROM planner_object_types WHERE code = :c AND is_enabled = 1 LIMIT 1");
    $tQ->execute(['c'=>$typeCode]);
    $t = $tQ->fetch();
    if (!$t) {
        \Planner\Response::json(['error' => 'object_type_not_found', 'code' => $typeCode], 404);
        return null;
    }

    $layer = strtolower((string)($t['default_layer'] ?? 'object'));
    if (!in_array($layer, ['system','object'], true)) $layer = 'object';

    $isLocked = (int)($t['default_locked'] ?? 0);
    if ($layer === 'system') $isLocked = 1; // hard rule

    $meta = json_decode($t['default_meta_json'] ?? '{}', true) ?: [];
    if ($layer === 'object') {
        foreach (['tag','note','color'] as $k) {
            if (array_key_exists($k, $incomingMeta)) $meta[$k] = $incomingMeta[$k];
        }
    }

    // footprint: allow meta.footprint override (for rotation)
    $fp = null;
    if (isset($incomingMeta['footprint']) && is_array($incomingMeta['footprint']) && count($incomingMeta['footprint']) > 0) {
        $fp = $incomingMeta['footprint'];
    } else {
        $fp = json_decode($t['footprint_json'] ?? '[]', true) ?: [];
        if (!is_array($fp) || count($fp) === 0) $fp = [['dx'=>0,'dy'=>0]];
    }
    $meta['footprint'] = $fp;

    $W = (int)$map['width']; $H = (int)$map['height'];
    $tiles = [];
    foreach ($fp as $p) {
        $tx = $x + (int)($p['dx'] ?? 0);
        $ty = $y + (int)($p['dy'] ?? 0);
        if ($tx < 0 || $ty < 0 || $tx >= $W || $ty >= $H) {
            \Planner\Response::json(['error' => 'out_of_bounds', 'tile' => ['x'=>$tx,'y'=>$ty]], 409);
            return null;
        }
        $tiles[] = ['x'=>$tx,'y'=>$ty];
    }

    $mapId = (int)$map['id'];

    try {
        $pdo->beginTransaction();

        $check = $pdo->prepare("SELECT x,y,object_id FROM planner_occupancy WHERE map_id=:m AND x=:x AND y=:y LIMIT 1");
        foreach ($tiles as $tile) {
            $check->execute(['m'=>$mapId,'x'=>$tile['x'],'y'=>$tile['y']]);
            if ($hit = $check->fetch()) {
                $pdo->rollBack();
                \Planner\Response::json(['error' => 'target_occupied', 'tile' => $hit], 409);
                return null;
            }
        }

        $ins = $pdo->prepare("
            INSERT INTO planner_objects (map_id, type, layer, is_locked, x, y, meta_json)
            VALUES (:m,:type,:layer,:locked,:x,:y,:meta)
        ");
        $ins->execute([
            'm'=>$mapId,
            'type'=>$typeCode,
            'layer'=>$layer,
            'locked'=>$isLocked,
            'x'=>$x,
            'y'=>$y,
            'meta'=>json_encode($meta, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
        ]);
        $newId = (int)$pdo->lastInsertId();

        $occ = $pdo->prepare("INSERT INTO planner_occupancy (map_id,x,y,object_id) VALUES (:m,:x,:y,:oid)");
        foreach ($tiles as $tile) {
            $occ->execute(['m'=>$mapId,'x'=>$tile['x'],'y'=>$tile['y'],'oid'=>$newId]);
        }

        $pdo->commit();
        return ['ok'=>true,'id'=>$newId];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        \Planner\Response::json(['error'=>'create_failed','detail'=>$e->getMessage()], 500);
        return null;
    }
});


// ----------------------------------------------------------
// API: UPDATE META (locked-aware)
// ----------------------------------------------------------
$router->post('/api/objects/{id}/update', function(array $params, array $ctx) {
    $pdo = $ctx['db']->pdo();
    $id  = (int)($params['id'] ?? 0);

    $row = $pdo->prepare("SELECT is_locked, meta_json FROM planner_objects WHERE id = :id LIMIT 1");
    $row->execute(['id'=>$id]);
    $obj = $row->fetch();

    if (!$obj) {
        \Planner\Response::json(['error'=>'Not found'], 404);
        return null;
    }
    if ((int)$obj['is_locked'] === 1) {
        \Planner\Response::json(['error'=>'locked'], 403);
        return null;
    }

    $data = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
    $meta = json_decode($obj['meta_json'] ?? '{}', true) ?: [];

    foreach (['tag','note','color'] as $k) {
        if (array_key_exists($k, $data)) $meta[$k] = $data[$k];
    }

    $u = $pdo->prepare("UPDATE planner_objects SET meta_json = :m WHERE id = :id");
    $u->execute([
        'm'=>json_encode($meta, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
        'id'=>$id
    ]);

    return ['ok'=>true,'id'=>$id,'meta'=>$meta];
});


// ----------------------------------------------------------
// API: MOVE (locked-aware + footprint from meta_json)
// ----------------------------------------------------------
$router->post('/api/objects/{id}/move', function(array $params, array $ctx) {
    $pdo = $ctx['db']->pdo();
    $id  = (int)($params['id'] ?? 0);

    $row = $pdo->prepare("SELECT id, map_id, x, y, is_locked, meta_json FROM planner_objects WHERE id = :id LIMIT 1");
    $row->execute(['id'=>$id]);
    $obj = $row->fetch();

    if (!$obj) {
        \Planner\Response::json(['error'=>'Not found'], 404);
        return null;
    }
    if ((int)$obj['is_locked'] === 1) {
        \Planner\Response::json(['error'=>'locked'], 403);
        return null;
    }

    $data = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
    if (!isset($data['x'], $data['y'])) {
        \Planner\Response::json(['error'=>'missing_x_y'], 400);
        return null;
    }
    $newX = (int)$data['x'];
    $newY = (int)$data['y'];
    $mapId = (int)$obj['map_id'];

    $meta = json_decode($obj['meta_json'] ?? '{}', true) ?: [];
    $fp = $meta['footprint'] ?? [['dx'=>0,'dy'=>0]];
    if (!is_array($fp) || count($fp) === 0) $fp = [['dx'=>0,'dy'=>0]];

    $tiles = [];
    foreach ($fp as $t) {
        $tiles[] = ['x'=>$newX + (int)($t['dx'] ?? 0), 'y'=>$newY + (int)($t['dy'] ?? 0)];
    }

    try {
        $pdo->beginTransaction();

        // Release old occupancy
        $pdo->prepare("DELETE FROM planner_occupancy WHERE map_id = :m AND object_id = :oid")
            ->execute(['m'=>$mapId,'oid'=>$id]);

        // Check new occupancy
        $check = $pdo->prepare("SELECT x,y,object_id FROM planner_occupancy WHERE map_id=:m AND x=:x AND y=:y LIMIT 1");
        foreach ($tiles as $t) {
            $check->execute(['m'=>$mapId,'x'=>$t['x'],'y'=>$t['y']]);
            if ($hit = $check->fetch()) {
                $pdo->rollBack();
                \Planner\Response::json(['error'=>'target_occupied','tile'=>$hit], 409);
                return null;
            }
        }

        // Move anchor
        $pdo->prepare("UPDATE planner_objects SET x=:x, y=:y WHERE id=:id")
            ->execute(['x'=>$newX,'y'=>$newY,'id'=>$id]);

        // Claim new occupancy
        $occ = $pdo->prepare("INSERT INTO planner_occupancy (map_id,x,y,object_id) VALUES (:m,:x,:y,:oid)");
        foreach ($tiles as $t) {
            $occ->execute(['m'=>$mapId,'x'=>$t['x'],'y'=>$t['y'],'oid'=>$id]);
        }

        $pdo->commit();
        return ['ok'=>true,'id'=>$id,'x'=>$newX,'y'=>$newY,'tiles'=>$tiles];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        \Planner\Response::json(['error'=>'move_failed','detail'=>$e->getMessage()], 500);
        return null;
    }
});


// ----------------------------------------------------------
// API: DELETE (locked-aware)  (router has no DELETE -> use POST)
// ----------------------------------------------------------
$router->post('/api/objects/{id}/delete', function(array $params, array $ctx) {
    $pdo = $ctx['db']->pdo();
    $id  = (int)($params['id'] ?? 0);

    $row = $pdo->prepare("SELECT map_id, is_locked FROM planner_objects WHERE id = :id LIMIT 1");
    $row->execute(['id'=>$id]);
    $obj = $row->fetch();

    if (!$obj) {
        \Planner\Response::json(['error'=>'Not found'], 404);
        return null;
    }
    if ((int)$obj['is_locked'] === 1) {
        \Planner\Response::json(['error'=>'locked'], 403);
        return null;
    }

    try {
        $pdo->beginTransaction();
        $pdo->prepare("DELETE FROM planner_occupancy WHERE map_id=:m AND object_id=:oid")
            ->execute(['m'=>(int)$obj['map_id'], 'oid'=>$id]);
        $pdo->prepare("DELETE FROM planner_objects WHERE id=:id")->execute(['id'=>$id]);
        $pdo->commit();
        return ['ok'=>true,'id'=>$id];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        \Planner\Response::json(['error'=>'delete_failed','detail'=>$e->getMessage()], 500);
        return null;
    }
});

// ----------------------------------------------------------
// API: EXPORT
// ----------------------------------------------------------
$router->get('/api/maps/{slug}/export', function(array $params, array $ctx) {
    $slug = $params['slug'] ?? '';
    $pdo  = $ctx['db']->pdo();

    $stmt = $pdo->prepare("SELECT id, slug, width, height FROM maps WHERE slug = :s LIMIT 1");
    $stmt->execute(['s' => $slug]);
    $map = $stmt->fetch();

    if (!$map) {
        \Planner\Response::json(['error' => 'Map not found'], 404);
        return null;
    }

    $layer = strtolower((string)($_GET['layer'] ?? 'all'));
    if (!in_array($layer, ['all','system','object'], true)) $layer = 'all';

    if ($layer === 'all') {
        $q = $pdo->prepare("SELECT type, x, y, layer, is_locked, meta_json FROM planner_objects WHERE map_id = :m ORDER BY layer, id");
        $q->execute(['m'=>(int)$map['id']]);
    } else {
        $q = $pdo->prepare("SELECT type, x, y, layer, is_locked, meta_json FROM planner_objects WHERE map_id = :m AND layer = :layer ORDER BY id");
        $q->execute(['m'=>(int)$map['id'], 'layer'=>$layer]);
    }

    return [
        'schema' => 'wos-planner-export-v1',
        'exported_at' => gmdate('c'),
        'map' => ['slug'=>$map['slug'], 'width'=>(int)$map['width'], 'height'=>(int)$map['height']],
        'layer' => $layer,
        'objects' => $q->fetchAll(),
    ];
});


// ----------------------------------------------------------
// API: IMPORT (dryRun/apply)
// Body: { "objects": [ {type,x,y,layer,is_locked,meta_json}, ... ] }
// ----------------------------------------------------------
$router->post('/api/maps/{slug}/import', function(array $params, array $ctx) {
    $slug = $params['slug'] ?? '';
    $pdo  = $ctx['db']->pdo();

    $stmt = $pdo->prepare("SELECT id, slug, width, height FROM maps WHERE slug = :s LIMIT 1");
    $stmt->execute(['s' => $slug]);
    $map = $stmt->fetch();

    if (!$map) {
        \Planner\Response::json(['error' => 'Map not found'], 404);
        return null;
    }

    $dryRun = isset($_GET['dryRun']) ? ((int)$_GET['dryRun'] === 1) : true;

    $body = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
    $incoming = $body['objects'] ?? null;
    if (!is_array($incoming)) {
        \Planner\Response::json(['error'=>'invalid_payload','hint'=>'Body must be {\"objects\":[...]}'], 400);
        return null;
    }

    $mapId = (int)$map['id'];
    $W = (int)$map['width']; $H = (int)$map['height'];

    $report = [
        'dryRun' => $dryRun,
        'map' => ['id'=>$mapId,'slug'=>$map['slug'],'width'=>$W,'height'=>$H],
        'new' => [],
        'conflicts' => [],
        'out_of_bounds' => [],
        'skipped' => [],
        'applied' => ['inserted'=>0],
    ];

    $getBlockers = function(array $tiles) use ($pdo, $mapId) {
        $out = [];
        $q = $pdo->prepare("
            SELECT occ.x, occ.y, occ.object_id, o.layer, o.type
            FROM planner_occupancy occ
            JOIN planner_objects o ON o.id = occ.object_id
            WHERE occ.map_id = :m AND occ.x = :x AND occ.y = :y
            LIMIT 1
        ");
        foreach ($tiles as $t) {
            $q->execute(['m'=>$mapId,'x'=>$t['x'],'y'=>$t['y']]);
            if ($hit = $q->fetch()) $out[] = $hit;
        }
        return $out;
    };

    // pre-check
    foreach ($incoming as $i => $o) {
        if (!is_array($o)) { $report['skipped'][] = ['i'=>$i,'reason'=>'not_object']; continue; }
        $type = (string)($o['type'] ?? '');
        if ($type === '' || !isset($o['x'],$o['y'])) { $report['skipped'][] = ['i'=>$i,'reason'=>'missing_type_or_xy']; continue; }
        $x = (int)$o['x']; $y = (int)$o['y'];

        $layer = strtolower((string)($o['layer'] ?? 'object'));
        if (!in_array($layer, ['system','object'], true)) $layer = 'object';

        $isLocked = isset($o['is_locked']) ? (int)$o['is_locked'] : ($layer==='system'?1:0);
        if ($layer === 'system') $isLocked = 1;

        $metaJson = (string)($o['meta_json'] ?? '{}');
        $meta = json_decode($metaJson, true);
        if (!is_array($meta)) $meta = [];

        $fp = $meta['footprint'] ?? [['dx'=>0,'dy'=>0]];
        if (!is_array($fp) || count($fp) === 0) $fp = [['dx'=>0,'dy'=>0]];

        $tiles = [];
        $oob = false;
        foreach ($fp as $p) {
            $tx = $x + (int)($p['dx'] ?? 0);
            $ty = $y + (int)($p['dy'] ?? 0);
            if ($tx < 0 || $ty < 0 || $tx >= $W || $ty >= $H) { $oob=true; }
            $tiles[] = ['x'=>$tx,'y'=>$ty];
        }
        if ($oob) {
            $report['out_of_bounds'][] = ['i'=>$i,'type'=>$type,'x'=>$x,'y'=>$y,'tiles'=>$tiles];
            continue;
        }

        // conflicts
        $conf = false;
        $check = $pdo->prepare("SELECT 1 FROM planner_occupancy WHERE map_id=:m AND x=:x AND y=:y LIMIT 1");
        foreach ($tiles as $t) {
            $check->execute(['m'=>$mapId,'x'=>$t['x'],'y'=>$t['y']]);
            if ($check->fetch()) { $conf = true; break; }
        }
        if ($conf) {
            $report['conflicts'][] = ['i'=>$i,'type'=>$type,'x'=>$x,'y'=>$y,'tiles'=>$tiles,'blockers'=>$getBlockers($tiles)];
            continue;
        }

        $report['new'][] = ['i'=>$i,'type'=>$type,'x'=>$x,'y'=>$y,'layer'=>$layer,'is_locked'=>$isLocked,'meta_json'=>$metaJson,'tiles'=>$tiles];
    }

    if ($dryRun) return $report;

    try {
        $pdo->beginTransaction();

        $ins = $pdo->prepare("INSERT INTO planner_objects (map_id,type,layer,is_locked,x,y,meta_json) VALUES (:m,:type,:layer,:locked,:x,:y,:meta)");
        $occ = $pdo->prepare("INSERT INTO planner_occupancy (map_id,x,y,object_id) VALUES (:m,:x,:y,:oid)");

        foreach ($report['new'] as $n) {
            $ins->execute([
                'm'=>$mapId,'type'=>$n['type'],'layer'=>$n['layer'],'locked'=>(int)$n['is_locked'],
                'x'=>(int)$n['x'],'y'=>(int)$n['y'],'meta'=>$n['meta_json']
            ]);
            $newId = (int)$pdo->lastInsertId();
            foreach ($n['tiles'] as $t) $occ->execute(['m'=>$mapId,'x'=>$t['x'],'y'=>$t['y'],'oid'=>$newId]);
            $report['applied']['inserted']++;
        }

        $pdo->commit();
        return $report;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        \Planner\Response::json(['error'=>'import_failed','detail'=>$e->getMessage(),'report'=>$report], 500);
        return null;
    }
});

