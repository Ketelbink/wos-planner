<?php
declare(strict_types=1);

namespace Planner\View;

use Planner\Security\Auth;

final class Menu
{
    /**
     * @param array<int,array{label:string,path:string,perm:string}> $items
     */
    public static function render(array $items, string $basePath, ?array $user): string
    {
        $html = '<nav style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">';

        foreach ($items as $it) {
            if (!Auth::hasPermission($user, $it['perm'])) {
                continue;
            }

            $href  = htmlspecialchars($basePath . $it['path'], ENT_QUOTES, 'UTF-8');
            $label = htmlspecialchars($it['label'], ENT_QUOTES, 'UTF-8');

            $html .= '<a href="' . $href . '" '
                . 'style="color:#e6edf3;text-decoration:none;padding:6px 10px;'
                . 'border:1px solid rgba(255,255,255,.12);border-radius:8px;'
                . 'background:rgba(18,27,47,0.65);">'
                . $label
                . '</a>';
        }

        $html .= '</nav>';
        return $html;
    }
}
