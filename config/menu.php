<?php
declare(strict_types=1);

use Planner\Security\Perm;

/**
 * WoS Planner – Menu definition
 * Keep paths relative to basePath (e.g. /planner).
 * Each item has a permission key for future RBAC enforcement.
 */
return [
    [
        'label' => 'Map',
        'path'  => '/map/state-2277',
        'perm'  => Perm::VIEW_WORLD,
    ],
    [
        'label' => 'Alliances',
        'path'  => '/admin/alliances',
        'perm'  => Perm::EDIT_ALL,
    ],
    [
        'label' => 'Members',
        'path'  => '/admin/members',
        'perm'  => Perm::EDIT_ALL,
    ],
    [
        'label' => 'Docs',
        'path'  => '/docs',
        'perm'  => Perm::VIEW_WORLD,
    ],
];
