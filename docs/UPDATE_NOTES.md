# Update Bundle – Isometric Map Renderer (V0.2 MVP)

Date: 2026-02-25

## What’s included

- `public/assets/map.js`
  - Isometric (diamond) projection renderer
  - Basic 2.5D “height” prism effect per object type
  - Depth sorting by (x + yTop)
  - Hover highlight
  - Viewport bbox derived from screen corners
  - Pan/zoom/click-to-place maintained

- `public/assets/map.css`
  - Same styling as MVP

- `database/migrations/0002_map_core.sql`
  - Reference migration for map core (maps, planner_objects, planner_occupancy)

- `docs/*`
  - `system_info_planner.md` (sanitized)
  - `roadmap.md`
  - `decision_log.md`
  - `UPDATE_NOTES.md`

## Install steps (manual)

1) Copy the included files into your repo, preserving paths.
2) Ensure assets are reachable:
   - Either expose `/planner/public/assets` as `/planner/assets` via symlink:
     `ln -s public/assets assets`
3) Open:
   `/planner/map/<your-map-slug>`
