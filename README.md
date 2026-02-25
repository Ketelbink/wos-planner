<<<<<<< HEAD
# wos-planner
A state-, alliance-, beartrap organizer
=======
# WoS Planner

Minimal PHP router + PDO + migrations.

## Requirements
- PHP 8.1+ (liefst 8.2/8.3)
- MySQL/MariaDB
- Apache (rewrite enabled) or Nginx

## Setup
1) Copy env:
   - cp .env.example .env
   - set DB credentials

2) Install autoload:
   - composer install
   - composer dump-autoload

3) Run migrations:
   - php cli/migrate.php

## Test endpoints
- GET /planner/
- GET /planner/health
- GET /planner/db/ping
