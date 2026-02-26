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

ini_set('display_errors', '1');
error_reporting(E_ALL);

require __DIR__ . '/../vendor/autoload.php';

\Planner\Env::load(__DIR__ . '/../.env');

require __DIR__ . '/../config/config.php';

// Services
$db     = \Planner\Database::fromConfig($config['db']);
$router = new \Planner\Router();

// Routes (Single Source of Truth)
require __DIR__ . '/../app/routes.php';

// Dispatch
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri    = $_SERVER['REQUEST_URI'] ?? '/';

// base path: /planner (ook al draait index.php in /planner/public)
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
$basePath   = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
$basePath   = preg_replace('#/public$#', '', $basePath) ?: '';

$user = null;
if (class_exists(\Planner\Security\Auth::class)) {
    $user = \Planner\Security\Auth::currentUser();
}

$router->dispatch($method, $uri, [
    'db'        => $db,
    'config'    => $config,
    'base_path' => $basePath,
    'user'      => $user,
]);