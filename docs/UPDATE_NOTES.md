# HOTFIX: v1.2 patch fix

- Fix JS syntax errors in public/assets/map.js that could cause the UI to stay on loading (stray merge fragment, typo in function keyword, missing brace).
- No backend/API changes.

---

# Update Notes – V1.2 (Stabilization + Camera/UI Foundation)

Date: 2026-02-27

## Goals

- Keep the v1.1 planner stable and predictable.
- Add a camera foundation for both PC and mobile:
  - pan / zoom / reset
  - optional 45° view rotation (visual only)
- Prepare UI controls that will later grow into full navigation/actions (e.g. “move view to alliance HQ”).

## What changed

### `app/routes.php`
- Added topbar camera controls:
  - Zoom Out / Zoom In
  - Reset View
  - Rotate View (0° ↔ 45°)
- Minor cleanup in objects endpoint (removed accidental duplicate return).

### `public/assets/map.js`
- Added a unified camera engine:
  - Camera state: `camX`, `camY`, `zoom`, `viewRot`
  - Pointer-based panning (desktop + mobile)
  - Wheel zoom-to-cursor (desktop)
  - Pinch-to-zoom (mobile)
  - View rotation toggle (visual only)
  - Shift-hold in place mode temporarily straightens view

## Rules confirmed (no regressions)

- Delete remains **POST** (`/api/objects/{id}/delete`) — router has no delete().
- Layer filter binding remains HY093-proof (only bind placeholders that exist).
- Frontend remains iterable-safe for `state.objects`.

## Testing checklist (quick)

- Pan works (mouse drag + touch drag)
- Zoom works (mouse wheel + pinch + buttons)
- Rotate toggle works and selection/placement still works
- Reset view returns to map center at 100% zoom
- Place mode: R rotates footprint; Shift temporarily straightens view
