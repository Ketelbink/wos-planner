<?php
/**
 * ==============================================================
 * WoS Planner – V0.1
 * File: src/Database.php
 * Purpose: PDO database wrapper
 * ==============================================================
 */
declare(strict_types=1);

namespace Planner;

use PDO;

final class Database
{
    private PDO $pdo;

    private function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public static function fromConfig(array $db): self
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $db['host'],
            $db['port'],
            $db['name'],
            $db['charset'] ?? 'utf8mb4'
        );

        $pdo = new PDO($dsn, $db['user'], $db['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);

        return new self($pdo);
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }
}