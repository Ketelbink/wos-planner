<?php
/**
 * ==============================================================
 * WoS Planner – V0.1
 * File: config/config.php
 * Purpose: Global configuration (Single Source of Truth)
 * Notes:
 *   - DB staat los van wos-2277 core database
 *   - Gebruik bij voorkeur environment variables op productie
 * ==============================================================
 */
declare(strict_types=1);

$config = [

    // ----------------------------------------------------------
    // APPLICATION
    // ----------------------------------------------------------
    'app' => [
        'name' => 'WoS Planner',
        'env'  => getenv('APP_ENV') ?: 'local',
    ],

    // ----------------------------------------------------------
    // DATABASE (Planner – standalone)
    // ----------------------------------------------------------
    'db' => [
        'host'    => getenv('DB_HOST') ?: '127.0.0.1',
        'port'    => (int)(getenv('DB_PORT') ?: 3306),
        'name'    => getenv('DB_NAME') ?: 'wos_planner',
        'user'    => getenv('DB_USER') ?: 'wos_planner_user',
        'pass'    => getenv('DB_PASS') ?: '',
        'charset' => 'utf8mb4',
    ],

];