<?php
/**
 * ==============================================================
 * WoS Planner – V0.1
 * File: public/index.php
 * Purpose: Front controller (single entry point)
 * Notes:
 *   - No business logic here
 *   - Loads .env, config, routes, then dispatches
 * ==============================================================
 */
declare(strict_types=1);

/**
 * --------------------------------------------------------------
 * 1. BOOTSTRAP
 * --------------------------------------------------------------
 */
ini_set('display_errors', '1');
error_reporting(E_ALL);

require __DIR__ . '/../vendor/autoload.php';

\Planner\Env::load(__DIR__ . '/../.env');

require __DIR__ . '/../config/config.php';

/**
 * --------------------------------------------------------------
 * 2. SERVICES
 * --------------------------------------------------------------
 */
$db     = \Planner\Database::fromConfig($config['db']);
$router = new \Planner\Router();

/**
 * --------------------------------------------------------------
 * 3. ROUTES (Single Source of Truth)
 * --------------------------------------------------------------
 */
require __DIR__ . '/../app/routes.php';

/**
 * --------------------------------------------------------------
 * 4. DISPATCH
 * --------------------------------------------------------------
 */
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri    = $_SERVER['REQUEST_URI'] ?? '/';

// base path: /planner (ook al draait index.php in /planner/public)
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
$basePath   = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
$basePath   = preg_replace('#/public$#', '', $basePath) ?: '';

$router->dispatch($method, $uri, [
    'db'        => $db,
    'config'    => $config,
    'base_path' => $basePath, // <- belangrijk
]);