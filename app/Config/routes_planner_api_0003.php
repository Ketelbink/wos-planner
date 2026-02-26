<?php
// app/Config/routes_planner_api_0003.php
// Drop-in route additions for WoS Planner API V1.0 step 1.
// Adapt these to your router (CodeIgniter/Laravel/custom).

// Maps -> objects listing + tile lookup
// GET  /api/maps/{slug}/objects?layer=system|object|all
// GET  /api/maps/{slug}/tile?x=..&y=..&layer=system|object|all

// Objects CRUD-lite
// POST   /api/objects/{id}/update
// POST   /api/objects/{id}/move
// DELETE /api/objects/{id}

// Example (pseudo):
// $router->get('/api/maps/(:segment)/objects', 'PlannerApi::mapObjects/$1');
// $router->get('/api/maps/(:segment)/tile',    'PlannerApi::objectByTile/$1');
// $router->post('/api/objects/(:num)/update',  'PlannerApi::objectUpdate/$1');
// $router->post('/api/objects/(:num)/move',    'PlannerApi::objectMove/$1');
// $router->delete('/api/objects/(:num)',       'PlannerApi::objectDelete/$1');
