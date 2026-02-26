<?php
declare(strict_types=1);

namespace Planner\Security;

final class Auth
{
    public static function authEnabled(): bool
    {
        return (string)getenv('AUTH_ENABLED') === '1';
    }

    public static function devOpen(): bool
    {
        return (string)getenv('DEV_OPEN') === '1';
    }

    /**
     * V0.x: no login yet.
     * Later: return user info from session/JWT + DB lookup.
     *
     * @return array{user_id?:int, roles?:string[], alliance_id?:int}|null
     */
    public static function currentUser(): ?array
    {
        return null;
    }

    public static function hasPermission(?array $user, string $perm): bool
    {
        // V0.x: allow everything while auth is disabled or dev-open is enabled.
        if (!self::authEnabled() || self::devOpen()) {
            return true;
        }

        // Later: implement role->permission mapping.
        $roles = $user['roles'] ?? [];
        return in_array($perm, $roles, true);
    }

    public static function require(?array $user, string $perm): void
    {
        if (!self::hasPermission($user, $perm)) {
            \Planner\Response::json(['error' => 'Forbidden', 'perm' => $perm], 403);
            exit;
        }
    }
}
