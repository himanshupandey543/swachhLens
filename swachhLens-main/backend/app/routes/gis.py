"""GIS endpoints: live map data (dustbins + fleet), backed by SQLite.

GET /api/gis  is PUBLIC — the landing page (index.html) renders the map before
any login, so it must not require auth or redirect logged-out visitors.
PATCH /api/gis/bins/{id} is employee-only (a crew member marking a bin serviced).
"""
from __future__ import annotations

import json
import time

from fastapi import APIRouter, Depends, HTTPException

from ..database import execute, query, query_one
from ..dependencies import require_employee
from ..models import BinUpdate

router = APIRouter(prefix="/gis", tags=["gis"])

# The schematic map is an 840x520 SVG (2.5 m/px); the citizen pin is fixed.
_CITIZEN_PIN = {"x": 500, "y": 238}


def _bin_status(fill: int) -> str:
    if fill < 50:
        return "ok"
    if fill <= 80:
        return "watch"
    return "alert"


def _bin_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "x": row["x"],
        "y": row["y"],
        "fill": row["fill"],
        "type": row["type"],
        "status": _bin_status(row["fill"]),
        "lastServicedAt": row["last_serviced_at"],
    }


def _fleet_row(row: dict) -> dict:
    route = row["route"] or "[]"
    try:
        route = json.loads(route)
    except (json.JSONDecodeError, TypeError):
        route = []
    return {
        "id": row["id"],
        "driver": row["driver"],
        "plate": row["plate"],
        "ward": row["ward"],
        "route": route,
        "speedKmh": row["speed_kmh"],
        "status": row["status"],
    }


@router.get("")
def get_gis():
    bins = [_bin_row(r) for r in query("SELECT * FROM bins ORDER BY id")]
    fleet = [_fleet_row(r) for r in query("SELECT * FROM fleet ORDER BY id")]
    return {"bins": bins, "fleet": fleet, "citizen": _CITIZEN_PIN}


@router.patch("/bins/{bin_id}")
def update_bin(bin_id: str, body: BinUpdate, user: dict = Depends(require_employee)):
    row = query_one("SELECT id FROM bins WHERE id = ?", (bin_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Bin not found")
    now = int(time.time() * 1000)
    execute(
        "UPDATE bins SET fill = ?, last_serviced_at = ? WHERE id = ?",
        (body.fill, now, bin_id),
    )
    updated = query_one("SELECT * FROM bins WHERE id = ?", (bin_id,))
    return {"bin": _bin_row(updated)}