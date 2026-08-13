"""Database persistence layer supporting SQLite (local) and PostgreSQL (production).

FastAPI runs sync endpoints in a threadpool, so a single module-level
connection guarded by a lock is safe for both database backends.
"""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Any

from . import config, security
from .constants import ROSTER

_conn: Any = None
_lock = threading.Lock()
_is_postgres = False

# Unified schema (compatible with both SQLite and PostgreSQL)
SCHEMA_SQLITE = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK(role IN ('USER', 'EMPLOYEE')),
    employee_id   TEXT,
    created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
    id                  TEXT PRIMARY KEY,
    waste_type          TEXT NOT NULL,
    location            TEXT NOT NULL,
    lat                 REAL,
    lng                 REAL,
    description         TEXT NOT NULL,
    severity            TEXT NOT NULL DEFAULT 'Medium',
    photo               TEXT,
    reporter            TEXT NOT NULL,
    reporter_name       TEXT NOT NULL,
    is_booking          INTEGER NOT NULL DEFAULT 0,
    scheduled_at        INTEGER,
    suggested_group_id  TEXT,
    suggested_member_id TEXT,
    suggestion_reason   TEXT,
    assigned_group_id   TEXT,
    assigned_to         TEXT,
    status              TEXT NOT NULL DEFAULT 'PENDING',
    verified_by         TEXT,
    created_at          INTEGER NOT NULL,
    resolved_at         INTEGER,
    history             TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter        ON reports(reporter);
CREATE INDEX IF NOT EXISTS idx_reports_status          ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_assigned_group  ON reports(assigned_group_id);
CREATE INDEX IF NOT EXISTS idx_reports_suggested_group ON reports(suggested_group_id);

CREATE TABLE IF NOT EXISTS bins (
    id               TEXT PRIMARY KEY,
    x                INTEGER NOT NULL,
    y                INTEGER NOT NULL,
    fill             INTEGER NOT NULL DEFAULT 0 CHECK(fill BETWEEN 0 AND 100),
    type             TEXT NOT NULL DEFAULT 'Mixed',
    last_serviced_at INTEGER,
    created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bins_type ON bins(type);

CREATE TABLE IF NOT EXISTS fleet (
    id         TEXT PRIMARY KEY,
    driver     TEXT NOT NULL,
    plate      TEXT NOT NULL,
    ward       TEXT NOT NULL DEFAULT 'Ward 4',
    route      TEXT NOT NULL,
    speed_kmh  REAL NOT NULL DEFAULT 24,
    status     TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS initiatives (
    id           TEXT PRIMARY KEY,
    ngo          TEXT NOT NULL,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    category     TEXT NOT NULL DEFAULT 'cleanup',
    icon         TEXT NOT NULL DEFAULT '🌱',
    location     TEXT NOT NULL DEFAULT '',
    scheduled_at INTEGER,
    capacity     INTEGER,
    created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_initiatives_category ON initiatives(category);

CREATE TABLE IF NOT EXISTS initiative_signups (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    initiative_id TEXT NOT NULL REFERENCES initiatives(id),
    user_email    TEXT NOT NULL REFERENCES users(email),
    joined_at     INTEGER NOT NULL,
    UNIQUE(initiative_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_signups_user ON initiative_signups(user_email);
"""

SCHEMA_POSTGRES = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK(role IN ('USER', 'EMPLOYEE')),
    employee_id   TEXT,
    created_at    BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
    id                  TEXT PRIMARY KEY,
    waste_type          TEXT NOT NULL,
    location            TEXT NOT NULL,
    lat                 REAL,
    lng                 REAL,
    description         TEXT NOT NULL,
    severity            TEXT NOT NULL DEFAULT 'Medium',
    photo               TEXT,
    reporter            TEXT NOT NULL,
    reporter_name       TEXT NOT NULL,
    is_booking          INTEGER NOT NULL DEFAULT 0,
    scheduled_at        BIGINT,
    suggested_group_id  TEXT,
    suggested_member_id TEXT,
    suggestion_reason   TEXT,
    assigned_group_id   TEXT,
    assigned_to         TEXT,
    status              TEXT NOT NULL DEFAULT 'PENDING',
    verified_by         TEXT,
    created_at          BIGINT NOT NULL,
    resolved_at         BIGINT,
    history             TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_reports_reporter        ON reports(reporter);
CREATE INDEX IF NOT EXISTS idx_reports_status          ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_assigned_group  ON reports(assigned_group_id);
CREATE INDEX IF NOT EXISTS idx_reports_suggested_group ON reports(suggested_group_id);

CREATE TABLE IF NOT EXISTS bins (
    id               TEXT PRIMARY KEY,
    x                INTEGER NOT NULL,
    y                INTEGER NOT NULL,
    fill             INTEGER NOT NULL DEFAULT 0 CHECK(fill BETWEEN 0 AND 100),
    type             TEXT NOT NULL DEFAULT 'Mixed',
    last_serviced_at BIGINT,
    created_at       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bins_type ON bins(type);

CREATE TABLE IF NOT EXISTS fleet (
    id         TEXT PRIMARY KEY,
    driver     TEXT NOT NULL,
    plate      TEXT NOT NULL,
    ward       TEXT NOT NULL DEFAULT 'Ward 4',
    route      TEXT NOT NULL,
    speed_kmh  REAL NOT NULL DEFAULT 24,
    status     TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS initiatives (
    id           TEXT PRIMARY KEY,
    ngo          TEXT NOT NULL,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    category     TEXT NOT NULL DEFAULT 'cleanup',
    icon         TEXT NOT NULL DEFAULT '🌱',
    location     TEXT NOT NULL DEFAULT '',
    scheduled_at BIGINT,
    capacity     INTEGER,
    created_at   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_initiatives_category ON initiatives(category);

CREATE TABLE IF NOT EXISTS initiative_signups (
    id            SERIAL PRIMARY KEY,
    initiative_id TEXT NOT NULL REFERENCES initiatives(id),
    user_email    TEXT NOT NULL REFERENCES users(email),
    joined_at     BIGINT NOT NULL,
    UNIQUE(initiative_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_signups_user ON initiative_signups(user_email);
"""


def get_conn():
    """Get database connection (SQLite or PostgreSQL based on DATABASE_URL)."""
    global _conn, _is_postgres

    if _conn is None:
        db_url = config.DATABASE_URL

        if db_url.startswith("postgresql://"):
            # PostgreSQL connection
            import psycopg2
            import psycopg2.extras

            _is_postgres = True
            _conn = psycopg2.connect(db_url)
            _conn.autocommit = False
            print(f"✅ Connected to PostgreSQL database")
        else:
            # SQLite connection (default for local development)
            import sqlite3

            _is_postgres = False
            db_path = db_url.replace("sqlite:///", "")
            _conn = sqlite3.connect(db_path, check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA foreign_keys = ON")
            print(f"✅ Connected to SQLite database: {db_path}")

    return _conn


def query(sql: str, params: tuple = ()) -> list[dict]:
    """Execute a SELECT query and return all rows as dicts."""
    with _lock:
        conn = get_conn()
        if _is_postgres:
            import psycopg2.extras
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            # Convert SQLite-style ? placeholders to PostgreSQL %s
            sql = sql.replace("?", "%s")
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            cursor.close()
            return [dict(r) for r in rows]
        else:
            rows = conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]


def query_one(sql: str, params: tuple = ()) -> dict | None:
    """Execute a SELECT query and return the first row as a dict, or None."""
    with _lock:
        conn = get_conn()
        if _is_postgres:
            import psycopg2.extras
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            sql = sql.replace("?", "%s")
            cursor.execute(sql, params)
            row = cursor.fetchone()
            cursor.close()
            return dict(row) if row else None
        else:
            row = conn.execute(sql, params).fetchone()
            return dict(row) if row else None


def execute(sql: str, params: tuple = ()) -> None:
    """Execute an INSERT/UPDATE/DELETE statement."""
    with _lock:
        conn = get_conn()
        if _is_postgres:
            cursor = conn.cursor()
            sql = sql.replace("?", "%s")
            cursor.execute(sql, params)
            conn.commit()
            cursor.close()
        else:
            conn.execute(sql, params)
            conn.commit()


def executemany(sql: str, seq: list[tuple]) -> None:
    """Execute a statement multiple times with different parameters."""
    with _lock:
        conn = get_conn()
        if _is_postgres:
            cursor = conn.cursor()
            sql = sql.replace("?", "%s")
            cursor.executemany(sql, seq)
            conn.commit()
            cursor.close()
        else:
            conn.executemany(sql, seq)
            conn.commit()


def _seed_users() -> None:
    now = int(time.time() * 1000)
    existing = {u["email"] for u in query("SELECT email FROM users")}
    demo = [
        {
            "email": "user@test.com",
            "password": "123456",
            "name": "Aarav Citizen",
            "role": "USER",
            "employee_id": None,
        },
        {
            "email": "employee@test.com",
            "password": "123456",
            "name": "John Driver",
            "role": "EMPLOYEE",
            "employee_id": "emp_john",
        },
    ]
    for u in demo:
        if u["email"] in existing:
            continue
        execute(
            "INSERT INTO users (id, email, password_hash, name, role, employee_id, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                "usr_" + security.sha256_short(u["email"]),
                u["email"],
                security.hash_password(u["password"]),
                u["name"],
                u["role"],
                u["employee_id"],
                now,
            ),
        )
    # Belt & braces: make sure every roster member has a login
    for email, emp_id in {
        "john.driver@test.com": "emp_john",
        "sarah.collector@test.com": "emp_sarah",
        "ravi.kumar@test.com": "emp_ravi",
        "mei.chen@test.com": "emp_mei",
        "ahmed.ali@test.com": "emp_ahmed",
    }.items():
        if email in existing:
            continue
        member = next((r for r in ROSTER if r["id"] == emp_id), None)
        if not member:
            continue
        execute(
            "INSERT INTO users (id, email, password_hash, name, role, employee_id, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                "usr_" + security.sha256_short(email),
                email,
                security.hash_password("123456"),
                member["name"],
                "EMPLOYEE",
                emp_id,
                now,
            ),
        )


_BINS = [
    ("B-1042", 150, 308, 32, "Mixed"),
    ("B-1043", 305, 410, 64, "Mixed"),
    ("B-1044", 475, 228, 88, "High-rise"),
    ("B-1045", 635, 128, 45, "Market"),
    ("B-1046", 700, 292, 72, "Residential"),
    ("B-1047", 410, 205, 20, "Park"),
]
_FLEET = ("TRK-8214", "Rajesh Kumar", "TN-07-KH 8214", "Ward 4",
          "[[60,320],[180,320],[180,420],[320,420],[320,220],[460,220],[460,120],[620,120],[620,300],[760,300]]",
          24.0, "ACTIVE")
_INITIATIVES = [
    ("ini_cleanup_01", "Green Ward Foundation", "Riverfront Clean-up Drive",
     "Join neighbours to clear the Ward 4 riverfront before the monsoon.", "cleanup", "🧹",
     "Adyar Riverfront, Ward 4", 5, 100),
    ("ini_trees_02", "Urban Forest Society", "One Million Trees — Ward 4",
     "Plant native saplings across Ward 4 parks and streets.", "treeplanting", "🌳",
     "North Zone Park", 12, 250),
    ("ini_ewaste_03", "E-Cycle India", "E-Waste Collection Camp",
     "Drop off old electronics and batteries — recycled safely on the spot.", "recycle_drive", "🔌",
     "Community Hall, East Zone", 7, 80),
    ("ini_compost_04", "Eco Residents Association", "Composting Workshop",
     "Hands-on workshop: turn kitchen waste into garden soil.", "workshop", "🌱",
     "West Zone Library", 9, 40),
]
_DEMO_CITIZENS = [
    ("vedant.pratap@test.com", "Vedant Pratap", 38),
    ("ankit.kumar@test.com", "Ankit Kumar", 35),
    ("riya.singh@test.com", "Riya Singh", 31),
    ("ayush.singh@test.com", "Ayush Singh", 29),
    ("shivam.kumar@test.com", "Shivam Kumar", 26),
    ("neha.sharma@test.com", "Neha Sharma", 23),
]
_DAY_MS = 86400000


def _seed_gis() -> None:
    """6 dustbins + 1 truck, mirroring the hardcoded values in js/gis.js."""
    now = int(time.time() * 1000)

    # Use INSERT ... ON CONFLICT for PostgreSQL, INSERT OR IGNORE for SQLite
    if _is_postgres:
        for b in _BINS:
            execute(
                "INSERT INTO bins (id, x, y, fill, type, last_serviced_at, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
                (b[0], b[1], b[2], b[3], b[4], None, now),
            )
        execute(
            "INSERT INTO fleet (id, driver, plate, ward, route, speed_kmh, status)"
            " VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
            _FLEET,
        )
    else:
        executemany(
            "INSERT OR IGNORE INTO bins (id, x, y, fill, type, last_serviced_at, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(b[0], b[1], b[2], b[3], b[4], None, now) for b in _BINS],
        )
        execute(
            "INSERT OR IGNORE INTO fleet (id, driver, plate, ward, route, speed_kmh, status)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            _FLEET,
        )


def _seed_initiatives() -> None:
    now = int(time.time() * 1000)

    if _is_postgres:
        for i in _INITIATIVES:
            execute(
                "INSERT INTO initiatives"
                " (id, ngo, title, description, category, icon, location, scheduled_at, capacity, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
                (i[0], i[1], i[2], i[3], i[4], i[5], i[6], now + i[7] * _DAY_MS, i[8], now),
            )
    else:
        executemany(
            "INSERT OR IGNORE INTO initiatives"
            " (id, ngo, title, description, category, icon, location, scheduled_at, capacity, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [(i[0], i[1], i[2], i[3], i[4], i[5], i[6], now + i[7] * _DAY_MS, i[8], now) for i in _INITIATIVES],
        )


def _seed_leaderboard_demo() -> None:
    """Demo citizen accounts + resolved reports so the leaderboard is data-driven."""
    now = int(time.time() * 1000)
    existing_users = {u["email"] for u in query("SELECT email FROM users")}
    existing_reports = {r["id"] for r in query("SELECT id FROM reports")}

    waste = ["Plastic", "Organic", "E-Waste", "Hazardous"]
    locations = ["Ward 4 north gate", "Ward 4 east market", "Ward 4 west library",
                 "Ward 4 central park", "Ward 4 bus depot"]
    sevs = ["Low", "Medium", "High"]

    for k, (email, name, total) in enumerate(_DEMO_CITIZENS):
        if email not in existing_users:
            execute(
                "INSERT INTO users (id, email, password_hash, name, role, employee_id, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("usr_" + security.sha256_short(email), email,
                 security.hash_password("123456"), name, "USER", None, now),
            )
        prefix = "WM-DEMO-" + "".join(ch for ch in name.split()[0][:4] if ch.isalnum()).upper()
        resolved = []
        streak_days = min(total, 14)
        day_offsets = set(range(streak_days)) | {streak_days + 3 + (i % 45) for i in range(max(total - streak_days, 0))}
        for i, days_back in enumerate(sorted(day_offsets, reverse=True)):
            rid = f"{prefix}-{i + 1:02d}"
            if rid in existing_reports:
                continue
            rts = now - days_back * _DAY_MS
            created = rts - (45 * 60000 + (i * 137 % 1_800_000))
            execute(
                "INSERT INTO reports (id, waste_type, location, description, severity, photo,"
                " reporter, reporter_name, is_booking, scheduled_at, suggested_group_id,"
                " suggested_member_id, suggestion_reason, assigned_group_id, assigned_to,"
                " status, verified_by, created_at, resolved_at, history)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (rid, waste[i % 4], locations[i % len(locations)], f"Seeded demo cleanup ({name}).",
                 sevs[i % 3], "", email, name, 0, None, None, None, None, None, None,
                 "RESOLVED", "Group Lead", created, rts,
                 json.dumps([{"at": rts - 60000, "to": "RESOLVED", "by": name}])),
            )


def _migrate() -> None:
    """Add columns to pre-existing databases that predate later schema changes."""
    if _is_postgres:
        # PostgreSQL: Check if columns exist
        cols = {
            r["column_name"]
            for r in query(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'reports'"
            )
        }
        if "lat" not in cols:
            execute("ALTER TABLE reports ADD COLUMN lat REAL")
        if "lng" not in cols:
            execute("ALTER TABLE reports ADD COLUMN lng REAL")
    else:
        # SQLite: PRAGMA table_info
        cols = {r["name"] for r in query("PRAGMA table_info(reports)")}
        if "lat" not in cols:
            execute("ALTER TABLE reports ADD COLUMN lat REAL")
        if "lng" not in cols:
            execute("ALTER TABLE reports ADD COLUMN lng REAL")


def init_db() -> None:
    """Initialize database schema and seed demo data."""
    with _lock:
        conn = get_conn()
        schema = SCHEMA_POSTGRES if _is_postgres else SCHEMA_SQLITE

        if _is_postgres:
            cursor = conn.cursor()
            cursor.execute(schema)
            conn.commit()
            cursor.close()
        else:
            conn.executescript(schema)
            conn.commit()

    _migrate()
    _seed_users()
    _seed_gis()
    _seed_initiatives()
    _seed_leaderboard_demo()

    print("✅ Database initialized with demo data")


def report_from_row(row: dict) -> dict:
    """Convert a DB row (snake_case) to the camelCase shape the frontend expects."""
    return {
        "id": row["id"],
        "wasteType": row["waste_type"],
        "location": row["location"],
        "lat": row.get("lat"),
        "lng": row.get("lng"),
        "desc": row["description"],
        "severity": row["severity"],
        "photo": row["photo"] or "",
        "reporter": row["reporter"],
        "reporterName": row["reporter_name"],
        "isBooking": bool(row["is_booking"]),
        "scheduledAt": row["scheduled_at"],
        "suggestedGroupId": row["suggested_group_id"],
        "suggestedMemberId": row["suggested_member_id"],
        "suggestionReason": row["suggestion_reason"],
        "assignedGroupId": row["assigned_group_id"],
        "assignedTo": row["assigned_to"],
        "status": row["status"],
        "verifiedBy": row["verified_by"],
        "createdAt": row["created_at"],
        "resolvedAt": row["resolved_at"],
        "history": json.loads(row["history"] or "[]"),
    }
