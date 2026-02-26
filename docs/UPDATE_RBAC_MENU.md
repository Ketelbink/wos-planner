# RBAC + Menu Update (V0.2.1)

This bundle adds a minimal RBAC scaffold and a menu definition so the project is ready
for permissions and a navigation structure later, while keeping the app fully open for now.

## Added files

- `src/Security/Auth.php`
- `src/Security/Perm.php`
- `config/menu.php`
- `src/View/Menu.php`

## Environment toggles

Add to `.env` (later):

- `AUTH_ENABLED=1`
- `DEV_OPEN=0`

Current recommended dev mode (now):

- `AUTH_ENABLED=0`
- `DEV_OPEN=1`

## Required manual edits (small)

### 1) `public/index.php`

Add (or ensure) you pass these to router context:

```php
use Planner\Security\Auth;

$user = Auth::currentUser();

$router->dispatch($method, $uri, [
  'db'        => $db,
  'config'    => $config,
  'base_path' => $basePath,
  'user'      => $user,
]);
```

### 2) Protect endpoints (optional now)

Example:

```php
use Planner\Security\Auth;
use Planner\Security\Perm;

Auth::require($ctx['user'] ?? null, Perm::EDIT_WORLD);
```

Because `DEV_OPEN=1` (or `AUTH_ENABLED=0`) this won’t block anything yet.
