# SwachLens — Smart Waste Management (Web)

A role-based waste-reporting app built in **vanilla HTML / CSS / JavaScript** (no build step).
Two roles — **Citizen** and **Employee** (cleaning crew, incl. group leads) — each with their
own dashboard, sharing one centralized `localStorage` state so a report flows end-to-end
across every view.

## Pages

| URL | File | What it is |
| --- | ---- | ---------- |
| `/` | `index.html` | Premium editorial landing (Hero → Problem → System → role deep-dives → AI workflow → Impact → CTA) with nested role explorer |
| `/login` | `login.html` | Nested role login — role selector → role panel → contextual *Log in / Register as {Role}*; deep-link via `#citizen` / `#employee` |
| `/user` | `user.html` | Citizen dashboard — stats banner, report-or-book modal, My Reports tracker, recycling tips |
| `/employee` | `employee.html` | Employee dashboard — area-group tasks, mark-collected, group-lead dispatch approval + verification panel |

**Note:** public pages load `css/landing.css` + `js/landing.js`; in-app dashboards use `styles.css` + `css/app.css`. Auth and state are now backed by the FastAPI + SQLite backend (see below).

## Demo accounts

All demo accounts share the password `123456`.

| Role | Email | Roster |
| ---- | ----- | ------ |
| Citizen | `user@test.com` | — |
| Employee (East lead) | `employee@test.com` / `john.driver@test.com` | John Driver 🚛 |
| Employee | `sarah.collector@test.com` | Sarah Collector 🧺 |
| Employee | `ravi.kumar@test.com` | Ravi Kumar 🔌 |
| Employee | `mei.chen@test.com` | Mei Chen ☣️ |
| Employee | `ahmed.ali@test.com` | Ahmed Ali 🌱 |

Passwords are hashed with scrypt and stored in SQLite. Sessions are JWT tokens issued
by the backend. Registering in a role panel creates an account with that role; logging
in through the wrong panel is rejected ("Use the Citizen panel to sign in").

## Run it

```bash
# 1) Backend (FastAPI + SQLite) — serves the API AND the frontend:
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt      # Windows
# .venv/bin/pip install -r requirements.txt        # macOS / Linux
python run.py          # → http://127.0.0.1:8000
```

Open **http://127.0.0.1:8000** — the whole app runs from that one URL
(interactive API docs at `/docs`). The old Node static server
(`node server.js` on :8090) still works as an alternative frontend host; the
dashboards simply talk to the API over CORS.

## How the shared state works

`js/state.js` keeps an in-memory cache of the reports, but the single source of
truth is the **SQLite database** behind the FastAPI API. The AI dispatch matcher
runs on the **server** (`backend/app/constants.py`) when a report is created, and
role/lead checks are enforced server-side. The frontend re-syncs via a short poller
so multiple tabs/roles stay live. Crews are organised into **area groups** (North,
East, West); each group has a **lead** (an employee who oversees its crews).

1. **Citizen** submits a report or **books** a pickup (with a date/time) → `PENDING`
2. **AI** instantly suggests the best area group + crew member (`suggestedGroupId`,
   `suggestedMemberId`) — the **group lead approves** (or overrides, e.g. picking a
   member) → `IN_PROGRESS` (+ `assignedTo`)
3. **Employee** in that group marks `Mark as Collected` → `VERIFY`
4. **Group lead** checks the AI-assigned work → confirm `RESOLVED`, or send back →
   `IN_PROGRESS`
5. **Citizen**'s "My Reports" tab updates instantly (a short poller keeps every page
   in sync with the shared database).

Statuses: `PENDING` → `IN_PROGRESS` → `VERIFY` → `RESOLVED`.

Citizens can pin their exact spot on an in-form **Leaflet/OpenStreetMap** picker (or the 📍 GPS Detect button). The `lat`/`lng` is stored on the report and fed to the AI dispatch matcher, which routes by coordinates (north / east / west quadrants around the ward centre).

## Backend (FastAPI + SQLite)

The Python backend in `backend/` owns authentication and all report data:

| Endpoint | Method | Purpose |
| -------- | ------ | ------- |
| `/api/auth/register` | POST | Create an account → JWT |
| `/api/auth/login` | POST | Verify credentials → JWT |
| `/api/auth/me` | GET | Current user (Bearer token) |
| `/api/reports` | GET | List reports (role-scoped reads) |
| `/api/reports` | POST | Create a report (AI suggestion runs here) |
| `/api/reports/{id}/assign` | PATCH | Lead approves dispatch → `IN_PROGRESS` |
| `/api/reports/{id}/collect` | PATCH | Crew marks collected → `VERIFY` |
| `/api/reports/{id}/verify` | PATCH | Lead passes/rejects → `RESOLVED` / rework |
| `/api/reports/stats` | GET | Global counts |
| `/api/constants` | GET | Static groups / roster / waste types |
| `/api/analyze` | POST | Classify a waste photo (base64 data URL) → `{valid, reason, wasteType, severity, confidence, engine, details, summary}`. Rejects blank / too-small / unrecognised images (`valid:false`); real YOLO detection when a trained model exists, deterministic fallback otherwise |
| `/api/gis` | GET | Live map data: dustbins + fleet (route / driver / plate) — public |
| `/api/gis/bins/{id}` | PATCH | Crew marks a bin serviced (sets its fill level) |
| `/api/community/leaderboard` | GET | Points leaderboard computed from real reports (public; `me` when authenticated) |
| `/api/community/initiatives` | GET | NGO initiatives + volunteer counts (public; `joined` when authenticated) |
| `/api/community/initiatives/{id}/join` / `leave` | POST | Citizen volunteers / withdraws |

- Passwords hashed with **scrypt** (stdlib) — no plain text.
- Sessions are **HS256 JWTs** (stdlib `hmac`) kept in `swachlens.session`.
- The AI dispatch matcher and role/lead checks run **server-side**
  (`backend/app/constants.py`, `backend/app/routes/reports.py`).
- The static frontend is served by the backend too, so one URL runs the app.

## Structure

```
index.html / login.html / user.html / employee.html
css/
  styles.css      # base design tokens (shared, dashboards)
  app.css         # dashboards + app styles
  landing.css     # premium civic-tech design system for index.html + login.html
js/
  config.js       # app config + API_URL (points at the FastAPI backend)
  api.js          # thin REST client (Bearer JWT, 401 → login)
  ui.js           # theme, toast, reveal, counters, sheets, nav()
  auth.js         # Auth module (JWT sessions via API)
  state.js        # Store — mirrors the backend, async mutations, poller
  login.js        # nested role login logic (selector → panel → auth)
  user.js         # citizen dashboard (report or book)
  employee.js     # employee dashboard: group tasks + lead dispatch/verification
  landing.js      # landing page wiring: nav, reveals, counters, parallax
backend/
  app/            # FastAPI app: main, config, database, security, constants,
                  #   models, dependencies, routes (auth / reports / constants)
  run.py          # dev launcher (uvicorn on :8000)
  requirements.txt
  .env.example
  e2e_frontend_test.cjs   # Node harness driving the real frontend modules
server.js         # optional Node static server for local preview (:8090)
```
