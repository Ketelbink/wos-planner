<?php
/**
 * ==============================================================
 * WoS Planner – V0.1
 * File: src/Response.php
 * Purpose: 
 * ==============================================================
 */
declare(strict_types=1);

namespace Planner;

final class Response
{
    public static function json(array $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /** @param mixed $result */
    public static function send($result): void
    {
        if (is_array($result)) {
            self::json($result);
            return;
        }

        http_response_code(200);
        header('Content-Type: text/plain; charset=utf-8');
        echo (string)$result;
    }
}