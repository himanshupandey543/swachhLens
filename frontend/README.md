# SwachLens — Smart Waste Management (Web)

A role-based waste-reporting app built in **vanilla HTML / CSS / JavaScript** (no build step).
Three roles — **Citizen**, **Employee**, **Admin** — each with their own dashboard, sharing one
centralized `localStorage` state so a report flows end-to-end across every view.

## Pages

| URL | File | What it is |
| --- | ---- | ---------- |
| `/` | `index.html` | Landing page (stats + role cards) |
| `/login` | `login.html` | Trisected login/register — 3 role panels, each with a *Log in as {Role} / Register as {Role}* toggle |
| `/user` | `user.html` | Citizen dashboard — stats banner, report form modal, My Reports tracker, recycling tips |
| `/admin` | `admin.html` | Admin dashboard — unassigned queue + dispatch control (employee roster dropdown → Assign Task) |
| `/employee` | `employee.html` | Employee dashboard — assigned task cards + "Mark as Collected" |

## Demo accounts (mock auth)

| Role | Email | Password |
| ---- | ----- | -------- |
| Citizen | `user@test.com` | `123456` |
| Employee | `employee@test.com` | `123456` |
| Admin | `admin@test.com` | `123456` |

Registering in a role panel creates an account with that role. Logging in through the wrong
panel is rejected ("Use the Citizen panel to sign in").

## Run it

```bash
node server.js        # serves on http://localhost:8090
```

Then open **http://localhost:8090**. Any static server works (Python, `npx serve`, etc.).

## How the shared state works

`js/state.js` is the single source of truth, persisted in `localStorage` under
`swachlens.reports.v2`:

1. **Citizen** submits a report → `PENDING`
2. **Admin** sees it in the Unassigned Queue and assigns a crew → `IN_PROGRESS` (+ `assignedTo`)
3. **Employee** sees it in their tasks and taps *Mark as Collected* → `RESOLVED`
4. **Citizen**'s "My Reports" tab updates instantly (even across open tabs — a `storage`
   listener keeps every page live).

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
index.html / login.html / user.html / admin.html / employee.html
css/
  styles.css      # base design tokens (from the original index)
  app.css         # dashboards, login trisection, animations
js/
  config.js       # app config + Clerk key
  ui.js           # theme, toast, reveal, counters, sheets, nav()
  auth.js         # Auth module (Clerk + mock providers), session guard
  state.js        # Store — reports, roster, cross-page sync
  login.js        # trisected login logic
  user.js         # citizen dashboard
  admin.js        # admin dashboard + dispatch
  employee.js     # employee dashboard + collect
  landing.js      # index page stats/tips
server.js         # tiny no-dependency static server for local preview
```
