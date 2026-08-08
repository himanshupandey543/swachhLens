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

**Note:** public pages load `css/landing.css` + `js/landing.js`; in-app dashboards use `styles.css` + `css/app.css`. The Auth API, demo accounts and `Store` state are shared and unchanged.

## Demo accounts (mock auth)

| Role | Email | Password |
| ---- | ----- | -------- |
| Citizen | `user@test.com` | `123456` |
| Employee | `employee@test.com` | `123456` |

Registering in a role panel creates an account with that role. Logging in through the wrong
panel is rejected ("Use the Citizen panel to sign in").

## Run it

```bash
node server.js        # serves on http://localhost:8090
```

Then open **http://localhost:8090**. Any static server works (Python, `npx serve`, etc.).

## How the shared state works

`js/state.js` is the single source of truth, persisted in `localStorage` under
`swachlens.reports.v2`. Crews are organised into **area groups** (North, East, West);
each group has a **lead** (an employee who oversees its crews). The dispatch step is
demoed by a deterministic "AI" matcher in `Store.suggest()`:

1. **Citizen** submits a report or **books** a pickup (with a date/time) → `PENDING`
2. **AI** instantly suggests the best area group + crew member (`suggestedGroupId`,
   `suggestedMemberId`) — the **group lead approves** (or overrides, e.g. picking a
   member) → `IN_PROGRESS` (+ `assignedTo`)
3. **Employee** in that group marks `Mark as Collected` → `VERIFY`
4. **Group lead** checks the AI-assigned work → confirm `RESOLVED`, or send back →
   `IN_PROGRESS`
5. **Citizen**'s "My Reports" tab updates instantly (even across open tabs — a `storage`
   listener keeps every page live).

Statuses: `PENDING` → `IN_PROGRESS` → `VERIFY` → `RESOLVED`.

## Enabling Clerk

1. Open `js/config.js` and paste your publishable key:
   ```js
   CLERK_PUBLISHABLE_KEY: 'pk_test_xxxxxxxxxxxx',
   ```
2. Auth switches to Clerk automatically (SDK loaded from CDN). Roles are read from the
   account's `publicMetadata.role` (set at sign-up; inferred from the email as a fallback).
   While the key is empty, the built-in mock provider keeps the app fully demo-able.

## Structure

```
index.html / login.html / user.html / employee.html
css/
  styles.css      # base design tokens (shared, dashboards)
  app.css         # dashboards + app styles
  landing.css     # premium civic-tech design system for index.html + login.html
js/
  config.js       # app config + Clerk key
  ui.js           # theme, toast, reveal, counters, sheets, nav()
  auth.js         # Auth module (Clerk + mock providers), session guard
  state.js        # Store — reports, roster, cross-page sync
  login.js        # nested role login logic (selector → panel → auth)
  user.js         # citizen dashboard (report or book)
  employee.js     # employee dashboard: group tasks + lead dispatch/verification
  landing.js      # landing page wiring: nav, reveals, counters, parallax
server.js         # tiny no-dependency static server for local preview
```
