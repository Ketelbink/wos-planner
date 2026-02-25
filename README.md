# WoS Planner

Minimal PHP router + PDO + SQL migrations.

A lightweight standalone foundation for building a planner-style application.
Designed for subfolder installs (e.g. `/planner`) and clean GitHub collaboration.

---

## ?? Features (V0.1)

- Custom lightweight Router
- PDO database layer
- Environment-based configuration (.env)
- Composer PSR-4 autoloading
- SQL-based CLI migrations
- Subfolder install support
- No framework dependency

---

## ?? Requirements

- PHP 8.1+ (recommended 8.2 / 8.3)
- MySQL or MariaDB
- Apache (mod_rewrite enabled) or Nginx
- Composer

---

## ?? Installation

### 1) Clone the repository

```bash
git clone https://github.com/Ketelbink/wos-planner.git
cd wos-planner
```

---

### 2) Create environment file

```bash
cp .env.example .env
```

Edit `.env` and configure database credentials.

Example:

```env
APP_ENV=local

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=wos_planner
DB_USER=wos_planner_user
DB_PASS=your_password_here
```

> `.env` is ignored by Git and never committed.

---

### 3) Install dependencies

```bash
composer install
```

---

### 4) Run migrations

```bash
php cli/migrate.php
```

Expected output:

```
Applying 0001_init.sql...
OK: 0001_init.sql
Done. Applied: 1
```

---

## ?? Subfolder Installation (Example: `/planner`)

If installed inside a subfolder such as:

```
/httpdocs/planner
```

Make sure this file exists:

### `/planner/.htaccess`

```apache
RewriteEngine On

RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

RewriteRule ^ public/index.php [L,QSA]
```

The router automatically strips the base path (e.g. `/planner`).

---

## ?? Test Endpoints

After installation:

- GET /planner/
- GET /planner/health
- GET /planner/db/ping

---

## ?? Project Structure

- app/              ? Route definitions
- cli/              ? CLI tools (migrations)
- config/           ? Configuration (no secrets)
- database/         ? SQL migrations
- public/           ? Front controller
- src/              ? Core classes (Router, DB, Env, etc.)
- storage/          ? Logs (ignored by Git)

---

## ?? Database Migrations

Migrations are SQL-based and stored in:

- database/migrations/

Run:

```bash
php cli/migrate.php
```

Applied migrations are tracked in the `schema_migrations` table.

---

## ?? Security Notes

- `.env` is ignored by Git
- `/vendor` is ignored
- `/storage/logs` is ignored
- No credentials are stored in source code
- Migrations run via CLI only (never via web)

---

## ?? Development Status

V0.1 – Foundation complete

- Router
- PDO connection
- Composer autoload
- Environment loading
- CLI migrations
- Subfolder support

Next planned:
- Logging & error handler
- First planner feature
- Auth skeleton