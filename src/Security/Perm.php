<?php
declare(strict_types=1);

namespace Planner\Security;

final class Perm
{
    public const VIEW_WORLD            = 'VIEW_WORLD';
    public const EDIT_WORLD            = 'EDIT_WORLD';

    public const VIEW_ALLIANCE         = 'VIEW_ALLIANCE';
    public const EDIT_ALLIANCE_PLANNER = 'EDIT_ALLIANCE_PLANNER';

    public const EDIT_ALL              = 'EDIT_ALL'; // state admin
}
