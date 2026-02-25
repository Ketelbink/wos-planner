<?php
/**
 * ==============================================================
 * WoS Planner – V0.2
 * File: cli/migrate.php
 * Purpose: Run SQL migrations from database/migrations
 * Usage:
 *   php cli/migrate.php
 * ==============================================================
 */
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

\Planner\Env::load(__DIR__ . '/../.env');

require __DIR__ . '/../config/config.php';

/**
 * --------------------------------------------------------------
 * 1. INIT
 * --------------------------------------------------------------
 */
$pdo = \Planner\Database::fromConfig($config['db'])->pdo();

$dir = __DIR__ . '/../database/migrations';
if (!is_dir($dir)) {
    fwrite(STDERR, "Migrations folder not found: {$dir}\n");
    exit(1);
}

/**
 * --------------------------------------------------------------
 * 2. ENSURE schema_migrations EXISTS
 * --------------------------------------------------------------
 */
$pdo->exec("
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  migration VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_migration (migration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");

/**
 * --------------------------------------------------------------
 * 3. LOAD APPLIED
 * --------------------------------------------------------------
 */
$applied = $pdo->query("SELECT migration FROM schema_migrations")->fetchAll();
$appliedSet = [];
foreach ($applied as $row) {
    $appliedSet[$row['migration']] = true;
}

/**
 * --------------------------------------------------------------
 * 4. APPLY NEW MIGRATIONS
 * --------------------------------------------------------------
 */
$files = glob($dir . '/*.sql') ?: [];
sort($files);

$ran = 0;

foreach ($files as $file) {
    $name = basename($file);

    if (isset($appliedSet[$name])) {
        continue;
    }

    $sql = file_get_contents($file);
    if ($sql === false || trim($sql) === '') {
        fwrite(STDERR, "Empty migration: {$name}\n");
        exit(1);
    }

    echo "Applying {$name}...\n";

    try {
        $pdo->beginTransaction();
        $pdo->exec($sql);

        $stmt = $pdo->prepare("INSERT INTO schema_migrations (migration) VALUES (:m)");
        $stmt->execute(['m' => $name]);

        $pdo->commit();
        $ran++;
        echo "OK: {$name}\n";
    } catch (Throwable $e) {
        $pdo->rollBack();
        fwrite(STDERR, "FAILED: {$name}\n" . $e->getMessage() . "\n");
        exit(1);
    }
}

echo $ran === 0 ? "No migrations to apply.\n" : "Done. Applied: {$ran}\n";