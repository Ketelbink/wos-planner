<?php
/**
 * ==============================================================
 * WoS Planner – V0.1
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
    echo '<title>WoS Planner – ' . htmlspecialchars($map['name']) . '</title>';
    echo '<link rel="stylesheet" href="' . htmlspecialchars($basePath) . '/assets/map.css">';
    echo '</head><body>';

    echo '<div id="topbar">';
    echo '<strong>' . htmlspecialchars($map['name']) . '</strong>';
    echo '<select id="objType">
            <option value="BANNER">BANNER</option>
            <option value="CITY">CITY (2x2)</option>
            <option value="TRAP">TRAP</option>
            <option value="HQ">HQ</option>
          </select>';
    echo '<input id="tag" placeholder="tag (REN)" style="width:120px">';
    echo '<input id="note" placeholder="note" style="flex:1; min-width:160px">';
    echo '<input id="color" type="color" value="#7aa2ff" title="color">';
    echo '<span id="status">loading...</span>';
    echo '</div>';

    echo '<div id="canvasWrap"><canvas id="mapCanvas"></canvas></div>';

    echo '<script>';
    echo 'window.MAP_CFG = ' . json_encode([
        'slug' => $map['slug'],
        'width' => (int)$map['width'],
        'height' => (int)$map['height'],
        'basePath' => $basePath,
    ], JSON_UNESCAPED_SLASHES) . ';';
    echo '</script>';

    echo '<script src="' . htmlspecialchars($basePath) . '/assets/map.js"></script>';
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

    // clamp
    $xmin = max(0, min($xmin, (int)$map['width'] - 1));
    $xmax = max(0, min($xmax, (int)$map['width'] - 1));
    $ymin = max(0, min($ymin, (int)$map['height'] - 1));
    $ymax = max(0, min($ymax, (int)$map['height'] - 1));

    if ($xmax < $xmin) [$xmin, $xmax] = [$xmax, $xmin];
    if ($ymax < $ymin) [$ymin, $ymax] = [$ymax, $ymin];

    $q = $pdo->prepare("
        SELECT id, type, x, y, meta_json
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