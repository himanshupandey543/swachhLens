"""Community endpoints: leaderboard (computed from users + reports) and NGO
initiatives with volunteer signups.

Reads are PUBLIC but auth-optional: a logged-in caller gets personalised fields
(``me``, ``joined``), a logged-out visitor (public landing page) still gets data
without a 401. Writes (join/leave) require a citizen account.
"""
from __future__ import annotations

import time
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from ..database import execute, query, query_one
from ..dependencies import optional_current_user, require_citizen

router = APIRouter(prefix="/community", tags=["community"])

_ON_TIME_MS = 48 * 60 * 60 * 1000  # resolved within 48h of creation = "on time"


def _initials(name: str) -> str:
    parts = [p for p in (name or "").split() if p]
    if not parts:
        return "?"
    letters = parts[0][0] + (parts[-1][0] if len(parts) > 1 else "")
    return letters.upper()


def _streak(resolved_ms: list[int]) -> int:
    """Consecutive days (through today or yesterday) on which a report resolved."""
    if not resolved_ms:
        return 0
    days = {datetime.fromtimestamp(ts / 1000).date() for ts in resolved_ms}
    anchor = date.today()
    if anchor not in days:
        anchor -= timedelta(days=1)  # streak stays "alive" if today is still pending
    streak = 0
    d = anchor
    while d in days:
        streak += 1
        d -= timedelta(days=1)
    return streak


def _compute_leaderboard() -> list[dict]:
    """Rank all citizens by points computed from their real report history."""
    agg = query(
        "SELECT u.email, u.name,"
        " COUNT(r.id) AS total,"
        " COALESCE(SUM(CASE WHEN r.status = 'RESOLVED' THEN 1 ELSE 0 END), 0) AS resolved,"
        " COALESCE(SUM(CASE WHEN r.status = 'RESOLVED' AND (r.resolved_at - r.created_at) <= ? THEN 1 ELSE 0 END), 0) AS on_time"
        " FROM users u"
        " LEFT JOIN reports r ON r.reporter = u.email"
        " WHERE u.role = 'USER'"
        " GROUP BY u.id",
        (_ON_TIME_MS,),
    )
    resolved_by_user: dict[str, list[int]] = {}
    for r in query(
        "SELECT reporter, resolved_at FROM reports WHERE status = 'RESOLVED' AND resolved_at IS NOT NULL"
    ):
        resolved_by_user.setdefault(r["reporter"], []).append(r["resolved_at"])

    rows = []
    for a in agg:
        streak = _streak(resolved_by_user.get(a["email"], []))
        points = 30 * a["total"] + 50 * a["resolved"] + 20 * a["on_time"] + 5 * streak
        rows.append({
            "email": a["email"],
            "name": a["name"],
            "initials": _initials(a["name"]),
            "points": int(points),
            "reports": int(a["total"]),
            "resolved": int(a["resolved"]),
            "onTime": int(a["on_time"]),
            "streak": streak,
        })
    rows.sort(key=lambda o: (-o["points"], -o["resolved"], -o["reports"], o["name"]))
    for rank, o in enumerate(rows, start=1):
        o["rank"] = rank
    return rows


def _public(row: dict) -> dict:
    """Drop the email (privacy) — the caller's own row keeps it via ``me``."""
    return {k: v for k, v in row.items() if k != "email"}


def _initiative_row(row: dict, joined_email: str | None) -> dict:
    signups = query_one(
        "SELECT COUNT(*) AS n FROM initiative_signups WHERE initiative_id = ?", (row["id"],)
    )["n"]
    joined = False
    if joined_email:
        joined = bool(query_one(
            "SELECT 1 FROM initiative_signups WHERE initiative_id = ? AND user_email = ?",
            (row["id"], joined_email),
        ))
    return {
        "id": row["id"],
        "ngo": row["ngo"],
        "title": row["title"],
        "description": row["description"],
        "category": row["category"],
        "icon": row["icon"],
        "location": row["location"],
        "scheduledAt": row["scheduled_at"],
        "capacity": row["capacity"],
        "signups": int(signups),
        "joined": joined,
    }


@router.get("/leaderboard")
def leaderboard(limit: int = 10, user: dict | None = Depends(optional_current_user)):
    rows = _compute_leaderboard()
    leaders = [_public(r) for r in rows[:max(0, limit)]]
    me = None
    email = (user or {}).get("email")
    if email:
        mine = next((r for r in rows if r["email"] == email), None)
        if mine:
            me = {**_public(mine), "email": email}
    return {"leaders": leaders, "me": me, "total": len(rows), "limit": limit}


@router.get("/initiatives")
def list_initiatives(user: dict | None = Depends(optional_current_user)):
    email = (user or {}).get("email")
    inis = [
        _initiative_row(r, email)
        for r in query("SELECT * FROM initiatives ORDER BY scheduled_at")
    ]
    return {"initiatives": inis}


def _ensure_initiative(initiative_id: str) -> None:
    if not query_one("SELECT id FROM initiatives WHERE id = ?", (initiative_id,)):
        raise HTTPException(status_code=404, detail="Initiative not found")


@router.post("/initiatives/{initiative_id}/join")
def join_initiative(initiative_id: str, user: dict = Depends(require_citizen)):
    _ensure_initiative(initiative_id)
    execute(
        "INSERT OR IGNORE INTO initiative_signups (initiative_id, user_email, joined_at) VALUES (?, ?, ?)",
        (initiative_id, user["email"], int(time.time() * 1000)),
    )
    row = query_one("SELECT * FROM initiatives WHERE id = ?", (initiative_id,))
    return {"initiative": _initiative_row(row, user["email"])}


@router.post("/initiatives/{initiative_id}/leave")
def leave_initiative(initiative_id: str, user: dict = Depends(require_citizen)):
    _ensure_initiative(initiative_id)
    execute(
        "DELETE FROM initiative_signups WHERE initiative_id = ? AND user_email = ?",
        (initiative_id, user["email"]),
    )
    row = query_one("SELECT * FROM initiatives WHERE id = ?", (initiative_id,))
    return {"initiative": _initiative_row(row, user["email"])}