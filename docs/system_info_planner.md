# WoS Planner – System Architecture Document

Project: WoS Planner  
Scope: Standalone Territory Map Web Application  
Status: V0.1 – Foundation Phase  
Last Updated: 2026-02-25  

This document is intended to be public-repo friendly (no private host/user paths).

---

## Deployment Overview

- Subfolder deployment (e.g. `/planner`)
- Public entrypoint: `/planner/public/index.php`
- Only `/public` is web-accessible
- All schema changes via migrations (no manual edits)

---

## Core Architecture Decisions

- Standalone application (own auth, own DB)
- Public folder pattern
- `.env` for secrets (never committed)
- PDO via custom Database class

---

## GitHub Workflow

- Branches: `main`, `feature/*`, `fix/*`, `docs/*`
- Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`

---

## Territory Map – Confirmed Decisions

- Grid: 1200×1200 (x,y = 0..1199)
- Coordinate origin: bottom-left (0,0)
- 1 tile = 1 occupancy
- City footprint: 2×2 anchored bottom-left
- Layers: system (read-only), objects, future layers (paint/snapshots)

---

## Open Decisions (short list)

- Exact HQ footprint
- Exact trap footprint
- Occupancy optimizations (chunking)
- Zoom levels & UI polish
