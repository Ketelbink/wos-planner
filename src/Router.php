<?php
/**
 * ==============================================================
 * WoS Planner – V0.1
 * File: src/Router.php
 * Purpose: Minimal HTTP Router with {param} support
 * Notes:
 *   - Supports subfolder installs via ctx['base_path'] stripping
 *   - Example base_path: "/planner"
 * ==============================================================
 */
declare(strict_types=1);

namespace Planner;

final class Router
{
    /**
     * ----------------------------------------------------------
     * ROUTES
     * ----------------------------------------------------------
     * @var array<string, array<int, array{pattern:string, handler:callable}>>
     */
    private array $routes = [];

    // ----------------------------------------------------------
    // PUBLIC API
    // ----------------------------------------------------------

    public function get(string $path, callable $handler): void
    {
        $this->map('GET', $path, $handler);
    }

    public function post(string $path, callable $handler): void
    {
        $this->map('POST', $path, $handler);
    }

    /**
     * Dispatch an incoming request to the first matching route.
     *
     * @param string $method HTTP method (GET/POST/...)
     * @param string $uri    Full request URI (e.g. /planner/health?x=1)
     * @param array  $ctx    Context array passed from index.php
     *                       - 'base_path' => '/planner' (optional)
     */
    public function dispatch(string $method, string $uri, array $ctx = []): void
    {
        /**
         * ------------------------------------------------------
         * 1) NORMALISE PATH
         * ------------------------------------------------------
         */
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';

        /**
         * ------------------------------------------------------
         * 2) STRIP BASE PATH (for subfolder installs)
         * ------------------------------------------------------
         * Example:
         *   base_path = /planner
         *   request   = /planner/health
         *   result    = /health
         */
        $basePath = (string)($ctx['base_path'] ?? '');

        if ($basePath !== '' && $basePath !== '/' && str_starts_with($path, $basePath)) {
            $path = substr($path, strlen($basePath)) ?: '/';
        }

        /**
         * ------------------------------------------------------
         * 3) ROUTE MATCHING
         * ------------------------------------------------------
         */
        foreach ($this->routes[$method] ?? [] as $route) {
            if (!preg_match($route['pattern'], $path, $matches)) {
                continue;
            }

            $params = array_filter(
                $matches,
                fn($k) => !is_int($k),
                ARRAY_FILTER_USE_KEY
            );

            $result = ($route['handler'])($params, $ctx);

            if ($result !== null) {
                Response::send($result);
            }

            return;
        }

        /**
         * ------------------------------------------------------
         * 4) NOT FOUND
         * ------------------------------------------------------
         */
        Response::json(['error' => 'Not Found', 'path' => $path], 404);
    }

    // ----------------------------------------------------------
    // INTERNALS
    // ----------------------------------------------------------

    private function map(string $method, string $path, callable $handler): void
    {
        /**
         * Support /heroes/{id} style params
         */
        $pattern = preg_replace(
            '#\{([a-zA-Z_][a-zA-Z0-9_]*)\}#',
            '(?P<$1>[^/]+)',
            $path
        );

        $pattern = '#^' . $pattern . '$#';

        $this->routes[$method][] = [
            'pattern' => $pattern,
            'handler' => $handler,
        ];
    }
}