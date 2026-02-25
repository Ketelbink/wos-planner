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