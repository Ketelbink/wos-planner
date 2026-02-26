# WoS Planner – Decision Log

Track major architecture/function decisions.

---

## 2026-02-25 – Standalone Architecture

Decision: Planner is a standalone app with its own DB/auth.  
Reason: Avoid coupling, keep modular.  
Impact: Clean separation and safer deployments.

---

## 2026-02-25 – Grid 1200×1200 + Bottom-left Origin

Decision: Grid is 1200×1200 with origin at bottom-left.  
Reason: Matches in-game coordinate logic.  
Impact: Rendering must convert Y for screen/projected view.

---

## 2026-02-25 – Single Tile Occupancy

Decision: One tile can only be occupied once (including footprints).  
Reason: Prevent overlap bugs; enforce clarity.  
Impact: Occupancy table / constraint required.

---

## 2026-02-25 – City Footprint 2×2

Decision: City occupies 2×2 anchored bottom-left.  
Reason: Matches in-game footprint mechanics.  
Impact: Placement must validate 4 tiles.

---

## 2026-02-25 – Isometric Rendering (2.5D MVP)

Decision: Render map as diamond/isometric view, keep square data coords.  
Reason: Matches in-game look and improves usability.  
Impact: Frontend uses iso projection + depth sorting; backend unchanged.

-----


## 2026-02-26 � System Layer Architecture

Decision:
All fixed map objects (castle, towers, facilities, obstacles) are stored
in planner_objects with:

- layer = 'system'
- is_locked = 1

Reason:
Single object model keeps occupancy logic unified.

Impact:
System layer objects block placement and are read-only by default.

