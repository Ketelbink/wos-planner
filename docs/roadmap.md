# WoS Planner – Roadmap

Status: Active Development  

---

## V0.1 – Foundation (Completed)

- Standalone architecture
- Public folder pattern
- Custom router
- PDO database layer
- Environment configuration (.env)
- CLI-based SQL migrations
- GitHub workflow setup

---

## V1.1 – Map MVP (Current)

- Object placement API
- Tile occupancy validation
- Delete/Move for user objects
- System seed support

---

## V1.2 – Stabilization + Camera/UI Foundation (Next)

- Endpoint conventions finalized (delete via POST; no router delete)
- HY093-proof layer filtering
- Frontend iterable-safe guards
- Camera engine: pan/zoom/reset + view rotation 0°/45°
- Mobile-friendly controls (pointer events + pinch + zoom buttons)
- Action menu framework (future-proof)

---

## V0.2 – Map MVP (Legacy notes)

- Isometric (diamond) rendering
- Object placement API
- Tile occupancy validation
- City 2×2 footprint support
- Viewport/bbox loading

Next:
- Delete object
- Move object
- Alliance ownership model

---

## V0.3 – Trap Core

- Trap placement logic
- Trap footprint definition
- Trap View mode
- Alliance trap limits (2 per alliance)
- System layer support (castle/towers/facilities)
- Base map seed mechanism


---

## V0.4 – Permissions & Profiles

- Authentication system
- Role-based permissions
- Multi-profile support
